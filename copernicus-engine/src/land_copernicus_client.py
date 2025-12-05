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
        metadata_fields: Optional[List[str]] = None,
        batch_size: int = 25
    ) -> List[Dict[str, Any]]:
        """
        Search for datasets using @search endpoint

        Args:
            query: Search query string (optional)
            portal_type: Type filter (default: "DataSet")
            metadata_fields: Fields to include in response (UID, dataset_full_format, etc.)
            batch_size: Number of results per batch

        Returns:
            List of dataset metadata dictionaries

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

        if metadata_fields:
            params["metadata_fields"] = ",".join(metadata_fields)
        else:
            # Default fields needed for downloads
            params["metadata_fields"] = "UID,dataset_full_format,dataset_download_information"

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

            items = data.get("items", [])
            logger.info(f"[Search] Found {len(items)} datasets")

            return items

        except requests.RequestException as e:
            logger.error(f"[Search] Request failed: {e}")
            raise RuntimeError(f"Dataset search failed: {e}")

    def get_download_urls(
        self,
        dataset_uid: str,
        download_information_id: str,
        bbox: Optional[tuple[float, float, float, float]] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None
    ) -> List[str]:
        """
        Get direct download URLs for a dataset using @get-download-file-urls

        Args:
            dataset_uid: Dataset unique identifier
            download_information_id: Download collection identifier
            bbox: Bounding box (x_min, y_min, x_max, y_max) in EPSG:4326
            date_from: Start date in YYYY-MM-DD format (optional)
            date_to: End date in YYYY-MM-DD format (optional)

        Returns:
            List of direct download URLs

        Raises:
            RuntimeError: If request fails
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

            # Check if response is a list of URLs
            if isinstance(data, list):
                logger.info(f"[GetURLs] Retrieved {len(data)} download URLs")
                return data
            # Check if response is a dict with URLs in some field
            elif isinstance(data, dict):
                # Try common fields that might contain URLs
                if "items" in data:
                    urls = data["items"]
                    logger.info(f"[GetURLs] Retrieved {len(urls)} download URLs from 'items' field")
                    return urls
                elif "urls" in data:
                    urls = data["urls"]
                    logger.info(f"[GetURLs] Retrieved {len(urls)} download URLs from 'urls' field")
                    return urls
                elif "files" in data:
                    urls = data["files"]
                    logger.info(f"[GetURLs] Retrieved {len(urls)} download URLs from 'files' field")
                    return urls
                else:
                    logger.warning(f"[GetURLs] Dict response but no recognized URL field. Keys: {list(data.keys())}")
                    logger.warning(f"[GetURLs] Full response: {data}")
                    return []
            else:
                logger.warning(f"[GetURLs] Unexpected response type: {type(data)}")
                return []

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
        Download CORINE Land Cover 2018 dataset (pre-packaged raster 100m)

        This method:
        1. Searches for CLC2018 dataset
        2. Gets full dataset details
        3. Finds pre-packaged raster 100m file
        4. Downloads the file

        Args:
            output_dir: Output directory for downloaded files
            bbox: Optional bounding box (for future implementation)

        Returns:
            List of downloaded file paths

        Raises:
            RuntimeError: If download fails
        """
        logger.info("[CLC2018] Starting CLC2018 download workflow")

        if bbox:
            logger.warning("[CLC2018] Bounding box filtering not yet supported for pre-packaged downloads")

        # Step 1: Search for CLC2018
        logger.info("[CLC2018] Step 1/3: Searching for CLC2018 dataset...")
        results = self.search_datasets(query="CLC2018")

        if not results:
            raise RuntimeError("CLC2018 dataset not found in search results")

        # Find CLC2018 dataset (exact match)
        clc2018_dataset = None
        for item in results:
            title = item.get("title", "").lower()
            # Match "CORINE Land Cover 2018" exactly
            if "corine land cover 2018" in title and "change" not in title:
                clc2018_dataset = item
                break

        if not clc2018_dataset:
            raise RuntimeError("Could not identify CLC2018 in search results")

        dataset_url = clc2018_dataset.get("@id")
        logger.info(f"[CLC2018] Found dataset: {clc2018_dataset.get('title')}")
        logger.info(f"[CLC2018] URL: {dataset_url}")

        # Step 2: Get full dataset details
        logger.info("[CLC2018] Step 2/3: Getting full dataset details...")
        dataset_details = self.get_dataset_details(dataset_url)

        dataset_uid = dataset_details.get("UID")
        logger.info(f"[CLC2018] UID: {dataset_uid}")

        # Get downloadable_files (pre-packaged files)
        downloadable_files = dataset_details.get("downloadable_files", {})
        file_items = downloadable_files.get("items", [])

        if not file_items:
            raise RuntimeError("No downloadable files available for CLC2018")

        logger.info(f"[CLC2018] Found {len(file_items)} pre-packaged file options")

        # Find raster 100m file
        raster_file = None
        for file_item in file_items:
            if (file_item.get("type") == "Raster" and
                file_item.get("format") == "Geotiff" and
                file_item.get("resolution") == "100 m"):
                raster_file = file_item
                break

        if not raster_file:
            raise RuntimeError("No raster 100m GeoTIFF file found for CLC2018")

        filename = f"{raster_file.get('file')}.zip"
        file_size = raster_file.get("size", "unknown")
        logger.info(f"[CLC2018] Selected file: {filename} ({file_size})")

        # Step 3: Get download URLs using @get-download-file-urls
        # For pre-packaged files, we use dataset_download_information IDs
        logger.info("[CLC2018] Step 3/4: Getting download URLs for pre-packaged file...")

        # Get dataset_download_information from details (not downloadable_files)
        download_info = dataset_details.get("dataset_download_information")
        if not download_info:
            raise RuntimeError("No dataset_download_information available")

        download_items = download_info.get("items", [])
        if not download_items:
            raise RuntimeError("No download information items available")

        # Find RASTER 100m option in dataset_download_information
        raster_download_info = None
        for item in download_items:
            if item.get("name") == "RASTER" and item.get("collection") == "100 m":
                raster_download_info = item
                break

        if not raster_download_info:
            raise RuntimeError("No RASTER 100m option in dataset_download_information")

        download_info_id = raster_download_info.get("@id")
        logger.info(f"[CLC2018] Using download_information_id: {download_info_id}")

        # For CLC2018, we need to provide temporal extent (2017-2018)
        # Call @get-download-file-urls with dataset_uid and download_information_id
        try:
            urls = self.get_download_urls(
                dataset_uid=dataset_uid,
                download_information_id=download_info_id,
                date_from="2017-01-01",  # CLC2018 temporal extent
                date_to="2018-12-31"
            )

            if not urls:
                raise RuntimeError("No download URLs returned from API")

            logger.info(f"[CLC2018] Retrieved {len(urls)} download URLs")

            # Step 4: Download files
            logger.info("[CLC2018] Step 4/4: Downloading files...")
            downloaded_files = []

            for i, url in enumerate(urls, 1):
                # Extract filename from URL
                url_filename = url.split("/")[-1].split("?")[0] or f"clc2018_part{i}.tif"
                output_path = output_dir / url_filename

                logger.info(f"[CLC2018] Downloading file {i}/{len(urls)}: {url_filename}")

                try:
                    downloaded_path = self.download_file(url, output_path)
                    downloaded_files.append(downloaded_path)
                    logger.info(f"[CLC2018] Downloaded: {downloaded_path}")
                except Exception as e:
                    logger.error(f"[CLC2018] Failed to download {url_filename}: {e}")
                    # Continue with other files

            if not downloaded_files:
                raise RuntimeError("All downloads failed")

            logger.info(f"[CLC2018] Successfully downloaded {len(downloaded_files)} files")
            return downloaded_files

        except Exception as e:
            logger.error(f"[CLC2018] Download workflow failed: {e}")
            raise RuntimeError(f"Failed to download CLC2018: {e}")
