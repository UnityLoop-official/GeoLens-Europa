"""
Copernicus Land Monitoring Service (CLMS) Download API Client

Client for land.copernicus.eu CLMS Download API with JWT Bearer authentication.

Official Documentation:
- CLMS API Docs: https://eea.github.io/clms-api-docs/download.html
- How-to Guide: https://land.copernicus.eu/en/how-to-guides/how-to-download-spatial-data/how-to-download-data-using-clms-api
- Token Creation: https://land.copernicus.eu/en/how-to-guides/how-to-download-spatial-data/how-to-create-api-tokens

Environment Variables:
    COPERNICUS_CLIENT_ID - OAuth2 client ID
    COPERNICUS_USER_ID - User ID from service key
    COPERNICUS_PRIVATE_KEY_FILE - Path to RSA private key file
    COPERNICUS_TOKEN_URI - Token endpoint (default: https://land.copernicus.eu/@@oauth2-token)

Usage:
    from land_copernicus_client import CLMSClient

    client = CLMSClient.from_env()

    # Search for CLC2018 dataset
    results = client.search_datasets(query="CLC2018")

    # Download CLC2018 for Europe
    file_paths = client.download_dataset(
        dataset_uid="clc2018-uid",
        output_dir=Path("data/raw/clc")
    )
"""

import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, List, Dict, Any

import requests
import jwt
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger("geolens.copernicus")


# ============================================================================
# CLMS Download API Endpoints
# ============================================================================

CLMS_API_BASE = "https://land.copernicus.eu/api"
CLMS_SEARCH_ENDPOINT = f"{CLMS_API_BASE}/@search"
CLMS_DATAREQUEST_POST_ENDPOINT = f"{CLMS_API_BASE}/@datarequest_post"
CLMS_GET_DOWNLOAD_URLS_ENDPOINT = f"{CLMS_API_BASE}/@get-download-file-urls"
CLMS_FORMAT_CONVERSION_ENDPOINT = f"{CLMS_API_BASE}/@format_conversion_table"
CLMS_PROJECTIONS_ENDPOINT = f"{CLMS_API_BASE}/@projections"


@dataclass
class CLMSConfig:
    """Configuration for CLMS API client"""

    client_id: str
    user_id: str
    private_key: str  # PEM format
    token_uri: str

    @classmethod
    def from_env(cls) -> "CLMSConfig":
        """Load configuration from environment variables"""

        client_id = os.getenv("COPERNICUS_CLIENT_ID")
        if not client_id:
            raise ValueError("COPERNICUS_CLIENT_ID environment variable required")

        user_id = os.getenv("COPERNICUS_USER_ID")
        if not user_id:
            raise ValueError("COPERNICUS_USER_ID environment variable required")

        # Load private key from file
        private_key_file = os.getenv("COPERNICUS_PRIVATE_KEY_FILE")
        if not private_key_file:
            raise ValueError("COPERNICUS_PRIVATE_KEY_FILE environment variable required")

        key_path = Path(private_key_file)
        if not key_path.is_absolute():
            # Relative to copernicus-engine directory
            key_path = Path(__file__).parent.parent / key_path

        try:
            with open(key_path, 'r') as f:
                private_key = f.read()
        except FileNotFoundError:
            raise ValueError(f"Private key file not found: {key_path}")

        token_uri = os.getenv("COPERNICUS_TOKEN_URI", "https://land.copernicus.eu/@@oauth2-token")

        return cls(
            client_id=client_id,
            user_id=user_id,
            private_key=private_key,
            token_uri=token_uri
        )


class CLMSClient:
    """
    Client for Copernicus Land Monitoring Service (CLMS) Download API

    Implements the official CLMS Download API protocol for programmatic
    access to CLMS datasets (CLC, HRL, etc.).
    """

    def __init__(self, config: CLMSConfig):
        """
        Initialize CLMS API client

        Args:
            config: CLMSConfig instance
        """
        self.config = config
        self._access_token: Optional[str] = None
        self._token_expires_at: Optional[float] = None

        logger.info("[CLMSClient] Initialized")

    def _generate_jwt_assertion(self) -> str:
        """
        Generate JWT assertion for OAuth2 token request

        Returns:
            JWT assertion string
        """
        now = int(time.time())

        payload = {
            "iss": self.config.client_id,
            "sub": self.config.user_id,  # Must match service key user_id
            "aud": self.config.token_uri,
            "exp": now + 300,  # 5 minutes
            "iat": now
        }

        # Sign with private key
        token = jwt.encode(
            payload,
            self.config.private_key,
            algorithm="RS256"
        )

        return token

    def _get_access_token(self) -> str:
        """
        Obtain access token using JWT Bearer grant

        Returns:
            Access token string

        Raises:
            RuntimeError: If token request fails
        """
        # Check cached token
        if self._access_token and self._token_expires_at:
            if time.time() < self._token_expires_at - 60:
                logger.debug("[OAuth2] Using cached token")
                return self._access_token

        logger.info("[OAuth2] Requesting new token with JWT assertion")

        try:
            # Generate JWT assertion
            assertion = self._generate_jwt_assertion()

            # Request token
            response = requests.post(
                self.config.token_uri,
                data={
                    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                    "assertion": assertion
                },
                headers={
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                timeout=30
            )

            response.raise_for_status()
            token_data = response.json()

            access_token = token_data.get("access_token")
            expires_in = token_data.get("expires_in", 3600)

            if not access_token:
                raise RuntimeError("Token response missing access_token")

            # Cache token
            self._access_token = access_token
            self._token_expires_at = time.time() + expires_in

            logger.info(f"[OAuth2] Token obtained (expires in {expires_in}s)")
            return access_token

        except requests.RequestException as e:
            logger.error(f"[OAuth2] Token request failed: {e}")

            # Log response for debugging
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_body = e.response.text[:500]
                    logger.error(f"[OAuth2] Response: {error_body}")
                except Exception:
                    pass

            raise RuntimeError(f"Failed to obtain access token: {e}")

    def search_datasets(
        self,
        query: Optional[str] = None,
        portal_type: str = "DataSet",
        batch_size: int = 25,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Search for datasets using /api/@search endpoint

        Args:
            query: Search query string (optional)
            portal_type: Type filter (default: "DataSet")
            batch_size: Number of results per batch
            **kwargs: Additional search parameters

        Returns:
            List of simplified dataset dictionaries:
            {
                "uid": str,
                "title": str,
                "url": str,
                "description": str,
                "download_information": dict or None
            }

        Raises:
            RuntimeError: If search fails
        """
        logger.info(f"[Search] Searching datasets: query='{query}'")

        token = self._get_access_token()

        params = {
            "portal_type": portal_type,
            "b_size": batch_size
        }

        if query:
            params["SearchableText"] = query

        # Add any additional parameters
        params.update(kwargs)

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }

        try:
            response = requests.get(
                CLMS_SEARCH_ENDPOINT,
                params=params,
                headers=headers,
                timeout=120  # CLMS API can be slow
            )

            response.raise_for_status()
            data = response.json()

            raw_items = data.get("items", [])
            logger.info(f"[Search] Found {len(raw_items)} datasets")

            # Simplify response structure
            simplified_items = []
            for item in raw_items:
                simplified_items.append({
                    "uid": item.get("UID"),
                    "title": item.get("title"),
                    "url": item.get("@id"),
                    "description": item.get("description", ""),
                    "download_information": item.get("dataset_download_information")
                })

            return simplified_items

        except requests.RequestException as e:
            logger.error(f"[Search] Request failed: {e}")
            raise RuntimeError(f"Dataset search failed: {e}")

    def get_downloadable_files(self, dataset_details: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract downloadable files information from dataset details

        This method parses dataset_download_information from full dataset details
        (obtained via get_dataset_details) and returns a clean list of available files.

        Args:
            dataset_details: Full dataset details dict from get_dataset_details()

        Returns:
            List of file information dictionaries:
            {
                "id": str,
                "name": str,
                "format": str,
                "type": str (RASTER/VECTOR),
                "collection": str (e.g., "100 m"),
                "download_information_id": str
            }

        Raises:
            ValueError: If no download information available
        """
        logger.info("[GetFiles] Extracting downloadable files from dataset details")

        download_info = dataset_details.get("dataset_download_information")
        if not download_info:
            raise ValueError("No dataset_download_information in dataset details")

        # Handle both dict with 'items' and direct list
        if isinstance(download_info, dict):
            items = download_info.get("items", [])
        elif isinstance(download_info, list):
            items = download_info
        else:
            raise ValueError(f"Unexpected download_information format: {type(download_info)}")

        if not items:
            raise ValueError("No downloadable files found in dataset_download_information")

        # Simplify structure
        files = []
        for item in items:
            files.append({
                "id": item.get("@id"),
                "name": item.get("name", ""),
                "format": item.get("full_format", ""),
                "type": item.get("name", ""),  # RASTER/VECTOR
                "collection": item.get("collection", ""),
                "download_information_id": item.get("@id")
            })

        logger.info(f"[GetFiles] Found {len(files)} downloadable files")
        return files

    def get_download_file_urls(
        self,
        dataset_uid: str,
        download_information_id: str,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
        bbox: Optional[tuple[float, float, float, float]] = None,
        **kwargs
    ) -> List[str]:
        """
        Get direct download URLs using /api/@get-download-file-urls

        Generic wrapper for the CLMS auxiliary API endpoint that returns direct
        download URLs for datasets. This works for some datasets but NOT all
        (e.g., CLC2018 requires manual download of pre-packaged files).

        Args:
            dataset_uid: Dataset unique identifier
            download_information_id: Download collection identifier
            date_from: Start date (YYYY-MM-DD) for temporal filtering
            date_to: End date (YYYY-MM-DD) for temporal filtering
            bbox: Bounding box (x_min, y_min, x_max, y_max) in EPSG:4326
            **kwargs: Additional parameters

        Returns:
            List of direct download URLs (strings)

        Raises:
            ValueError: If API returns error message (e.g., date range issues)
            RuntimeError: If HTTP request fails
        """
        logger.info(f"[GetURLs] Getting download URLs for dataset: {dataset_uid}")

        token = self._get_access_token()

        params = {
            "dataset_uid": dataset_uid,
            "download_information_id": download_information_id
        }

        if bbox:
            x_min, y_min, x_max, y_max = bbox
            params.update({
                "x_min": x_min,
                "y_min": y_min,
                "x_max": x_max,
                "y_max": y_max
            })

        if date_from:
            params["date_from"] = date_from
        if date_to:
            params["date_to"] = date_to

        # Add any additional parameters
        params.update(kwargs)

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }

        try:
            response = requests.get(
                CLMS_GET_DOWNLOAD_URLS_ENDPOINT,
                params=params,
                headers=headers,
                timeout=30
            )

            response.raise_for_status()
            data = response.json()

            logger.debug(f"[GetURLs] Raw response: {data}")

            # Check for API error responses
            if isinstance(data, dict):
                # Check if response indicates an error
                if data.get("status") == "error":
                    error_msg = data.get("msg", "Unknown error")
                    logger.error(f"[GetURLs] API returned error: {error_msg}")
                    raise ValueError(f"CLMS API error: {error_msg}")

                # Try to extract URLs from dict
                if "items" in data:
                    urls = data["items"]
                    logger.info(f"[GetURLs] Retrieved {len(urls)} download URLs")
                    return urls
                elif "urls" in data:
                    urls = data["urls"]
                    logger.info(f"[GetURLs] Retrieved {len(urls)} download URLs")
                    return urls
                elif "files" in data:
                    urls = data["files"]
                    logger.info(f"[GetURLs] Retrieved {len(urls)} download URLs")
                    return urls
                else:
                    # Unrecognized dict format
                    logger.warning(f"[GetURLs] Unrecognized response format. Keys: {list(data.keys())}")
                    raise ValueError(f"Unrecognized API response format: {data}")

            # Check if response is a list of URLs
            elif isinstance(data, list):
                logger.info(f"[GetURLs] Retrieved {len(data)} download URLs")
                return data
            else:
                raise ValueError(f"Unexpected response type: {type(data)}")

        except requests.RequestException as e:
            logger.error(f"[GetURLs] Request failed: {e}")
            raise RuntimeError(f"Failed to get download URLs: {e}")

    def download_file(
        self,
        url: str,
        output_path: Path,
        chunk_size: int = 8 * 1024 * 1024
    ) -> Path:
        """
        Download a file from URL with progress logging

        Args:
            url: Download URL
            output_path: Destination file path
            chunk_size: Download chunk size in bytes (default: 8 MB)

        Returns:
            Path to downloaded file

        Raises:
            RuntimeError: If download fails
        """
        logger.info(f"[Download] Starting: {url}")
        logger.info(f"[Download] Destination: {output_path}")

        # Create parent directories
        output_path.parent.mkdir(parents=True, exist_ok=True)

        token = self._get_access_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "User-Agent": "geolens-europa-clms/1.0.0"
        }

        try:
            with requests.get(
                url,
                headers=headers,
                stream=True,
                timeout=(30, 600)
            ) as response:

                response.raise_for_status()

                # Get total size
                total_size = response.headers.get("Content-Length")
                if total_size:
                    total_size = int(total_size)
                    total_mb = total_size / 1024 / 1024
                    logger.info(f"[Download] Size: {total_mb:.2f} MB")

                # Download with progress
                downloaded = 0
                with open(output_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=chunk_size):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)

                            # Log progress every ~100 MB
                            if downloaded % (100 * 1024 * 1024) < chunk_size:
                                downloaded_mb = downloaded / 1024 / 1024
                                if total_size:
                                    progress = (downloaded / total_size) * 100
                                    logger.info(
                                        f"[Download] Progress: {downloaded_mb:.1f} MB ({progress:.1f}%)"
                                    )
                                else:
                                    logger.info(f"[Download] Downloaded: {downloaded_mb:.1f} MB")

                final_mb = downloaded / 1024 / 1024
                logger.info(f"[Download] Complete: {final_mb:.2f} MB")

                return output_path

        except requests.RequestException as e:
            logger.error(f"[Download] Failed: {e}")

            # Clean up partial file
            if output_path.exists():
                output_path.unlink()
                logger.debug(f"[Download] Removed partial file")

            raise RuntimeError(f"Download failed: {e}")

    def get_dataset_details(self, dataset_url: str) -> Dict[str, Any]:
        """
        Get full dataset details from dataset URL

        Args:
            dataset_url: Full dataset URL (from search results @id field)

        Returns:
            Complete dataset metadata

        Raises:
            RuntimeError: If request fails
        """
        logger.info(f"[GetDetails] Fetching dataset details: {dataset_url}")

        token = self._get_access_token()

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json"
        }

        try:
            response = requests.get(
                dataset_url,
                headers=headers,
                timeout=30
            )

            response.raise_for_status()
            data = response.json()

            logger.info(f"[GetDetails] Retrieved dataset details")
            return data

        except requests.RequestException as e:
            logger.error(f"[GetDetails] Request failed: {e}")
            raise RuntimeError(f"Failed to get dataset details: {e}")

    def download_clc2018(
        self,
        output_dir: Path,
        bbox: Optional[tuple[float, float, float, float]] = None
    ) -> List[Path]:
        """
        Download CORINE Land Cover 2018 dataset

        **IMPORTANT**: Programmatic download of CLC2018 via CLMS API is currently
        not supported for pre-packaged files. The @get-download-file-urls endpoint
        requires temporal parameters that are not applicable to static datasets.

        **Manual Download Required**:
        1. Visit https://land.copernicus.eu/en/products/corine-land-cover/clc2018
        2. Download the pre-packaged raster 100m ZIP file (u2018_clc2018_v2020_20u1_raster100m.zip, ~125 MB)
        3. Place it in data/raw/clc/ directory
        4. The ETL pipeline will automatically use the local file

        Args:
            output_dir: Output directory (unused - for API consistency)
            bbox: Bounding box (unused - for API consistency)

        Raises:
            NotImplementedError: Always raised with instructions for manual download
        """
        logger.error("[CLC2018] Attempted programmatic download of CLC2018")

        raise NotImplementedError(
            "Programmatic CLMS download for CLC2018 is currently not supported.\n\n"
            "The CLMS @get-download-file-urls API endpoint for pre-packaged files "
            "requires temporal date parameters that are not applicable to static datasets like CLC2018.\n\n"
            "MANUAL DOWNLOAD REQUIRED:\n"
            "1. Visit: https://land.copernicus.eu/en/products/corine-land-cover/clc2018\n"
            "2. Download: u2018_clc2018_v2020_20u1_raster100m.zip (~125 MB)\n"
            "3. Place in: data/raw/clc/\n"
            "4. The ETL pipeline will automatically use the local file.\n\n"
            "For dynamic datasets with temporal coverage, use:\n"
            "  - search_datasets() to find the dataset\n"
            "  - get_dataset_details() to get full metadata\n"
            "  - get_downloadable_files() to list available files\n"
            "  - get_download_file_urls() with appropriate date_from/date_to parameters"
        )
