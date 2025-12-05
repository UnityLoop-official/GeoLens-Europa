"""
Copernicus API Client

Generic client for accessing Copernicus Data Space API (STAC/OData endpoints).
Supports both static token and OAuth2 authentication.

Environment Variables:
    COPERNICUS_API_BASE_URL - Base URL for Copernicus API
    COPERNICUS_API_TOKEN - Static bearer token (optional)
    COPERNICUS_OIDC_TOKEN_URL - OAuth2 token endpoint (optional)
    COPERNICUS_CLIENT_ID - OAuth2 client ID (optional)
    COPERNICUS_CLIENT_SECRET - OAuth2 client secret (optional)

Usage:
    from copernicus_client import CopernicusClient, CopernicusConfig

    config = CopernicusConfig.from_env()
    client = CopernicusClient(config)

    # Search for products
    products = client.search_products(
        collection_id="CORINE",
        bbox=(-10.0, 35.0, 40.0, 72.0)
    )

    # Download asset
    asset_path = client.download_asset(
        asset_href="https://...",
        dest_path=Path("data/raw/dem.tif")
    )
"""

import logging
import os
import time
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger("geolens.copernicus")


@dataclass
class CopernicusConfig:
    """Configuration for Copernicus API client"""

    api_base_url: str
    api_token: Optional[str] = None
    oidc_token_url: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None

    # Timeouts
    connect_timeout: int = 30
    read_timeout: int = 300

    @classmethod
    def from_env(cls) -> "CopernicusConfig":
        """Load configuration from environment variables"""

        api_base_url = os.getenv("COPERNICUS_API_BASE_URL")
        if not api_base_url:
            raise ValueError(
                "COPERNICUS_API_BASE_URL environment variable is required. "
                "Example: https://datahub.creodias.eu"
            )

        # Try static token first
        api_token = os.getenv("COPERNICUS_API_TOKEN")

        # OAuth2 credentials
        oidc_token_url = os.getenv("COPERNICUS_OIDC_TOKEN_URL")
        client_id = os.getenv("COPERNICUS_CLIENT_ID")
        client_secret = os.getenv("COPERNICUS_CLIENT_SECRET")

        # Validate authentication configuration
        has_static_token = api_token is not None
        has_oauth_config = all([oidc_token_url, client_id, client_secret])

        if not has_static_token and not has_oauth_config:
            raise ValueError(
                "Authentication required. Provide either:\n"
                "  1. COPERNICUS_API_TOKEN (static bearer token)\n"
                "  OR\n"
                "  2. COPERNICUS_OIDC_TOKEN_URL + COPERNICUS_CLIENT_ID + "
                "COPERNICUS_CLIENT_SECRET (OAuth2)"
            )

        return cls(
            api_base_url=api_base_url,
            api_token=api_token,
            oidc_token_url=oidc_token_url,
            client_id=client_id,
            client_secret=client_secret,
        )


class CopernicusClient:
    """Client for Copernicus Data Space API"""

    VERSION = "1.0.0"

    def __init__(self, config: CopernicusConfig):
        """
        Initialize Copernicus API client

        Args:
            config: CopernicusConfig instance
        """
        self.config = config
        self._oauth_token: Optional[str] = None
        self._oauth_token_expires_at: Optional[float] = None
        self.session = self._build_session()

        logger.info(f"[CopernicusClient] Initialized with base URL: {config.api_base_url}")

    def _build_session(self) -> requests.Session:
        """
        Build requests session with retry logic and standard headers

        Returns:
            Configured requests.Session
        """
        session = requests.Session()

        # Retry strategy
        retry_strategy = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            allowed_methods=["GET", "POST"]
        )

        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)

        # Standard headers
        session.headers.update({
            "User-Agent": f"geolens-europa/{self.VERSION}",
            "Accept": "application/json",
        })

        return session

    def _get_oauth_token(self) -> str:
        """
        Obtain OAuth2 token from OIDC endpoint

        Returns:
            Bearer token string

        Raises:
            RuntimeError: If token request fails
        """
        # Check if cached token is still valid
        if self._oauth_token and self._oauth_token_expires_at:
            if time.time() < self._oauth_token_expires_at - 60:  # 60s buffer
                logger.debug("[OAuth2] Using cached token")
                return self._oauth_token

        logger.info(f"[OAuth2] Requesting new token from {self.config.oidc_token_url}")

        try:
            response = requests.post(
                self.config.oidc_token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.config.client_id,
                    "client_secret": self.config.client_secret,
                },
                timeout=(self.config.connect_timeout, self.config.read_timeout)
            )
            response.raise_for_status()

            token_data = response.json()
            access_token = token_data.get("access_token")
            expires_in = token_data.get("expires_in", 3600)

            if not access_token:
                raise RuntimeError("OAuth2 response missing access_token")

            # Cache token
            self._oauth_token = access_token
            self._oauth_token_expires_at = time.time() + expires_in

            logger.info(f"[OAuth2] Token obtained successfully (expires in {expires_in}s)")
            return access_token

        except requests.RequestException as e:
            logger.error(f"[OAuth2] Token request failed: {e}")
            raise RuntimeError(f"Failed to obtain OAuth2 token: {e}")

    def _get_auth_token(self) -> str:
        """
        Get authentication token (static or OAuth2)

        Returns:
            Bearer token string
        """
        if self.config.api_token:
            return self.config.api_token
        else:
            return self._get_oauth_token()

    def search_products(
        self,
        collection_id: str,
        bbox: tuple[float, float, float, float],
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        limit: int = 50,
        stac_path: str = "/stac/search"
    ) -> list[dict]:
        """
        Search for products in a collection

        Args:
            collection_id: Collection identifier (e.g., "CORINE", "COP-DEM")
            bbox: Bounding box (min_lon, min_lat, max_lon, max_lat) in EPSG:4326
            start_date: Start date filter (optional)
            end_date: End date filter (optional)
            limit: Maximum number of results (default: 50)
            stac_path: STAC API path (default: "/stac/search")

        Returns:
            List of product feature dictionaries

        Raises:
            RuntimeError: If search request fails
        """
        url = f"{self.config.api_base_url.rstrip('/')}{stac_path}"

        # Build STAC query
        query = {
            "collections": [collection_id],
            "bbox": list(bbox),
            "limit": min(limit, 100),  # API may have max limit
        }

        # Add temporal filter if provided
        if start_date or end_date:
            datetime_range = [
                start_date.isoformat() if start_date else "..",
                end_date.isoformat() if end_date else ".."
            ]
            query["datetime"] = "/".join(datetime_range)

        logger.info(f"[Search] Collection: {collection_id}, BBOX: {bbox}")

        # Get auth token
        token = self._get_auth_token()

        # Make request
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        all_features = []

        try:
            response = self.session.post(
                url,
                json=query,
                headers=headers,
                timeout=(self.config.connect_timeout, self.config.read_timeout)
            )

            if response.status_code == 401:
                logger.error("[Search] Authentication failed (401)")
                raise RuntimeError(
                    "Authentication failed. Check your COPERNICUS_API_TOKEN or OAuth2 credentials."
                )

            response.raise_for_status()
            data = response.json()

            # Extract features
            features = data.get("features", [])
            all_features.extend(features)

            logger.info(f"[Search] Found {len(features)} products")

            # Handle pagination (simplified - follow 'next' link if present)
            next_link = None
            for link in data.get("links", []):
                if link.get("rel") == "next":
                    next_link = link.get("href")
                    break

            # Fetch additional pages until limit reached
            while next_link and len(all_features) < limit:
                logger.debug(f"[Search] Fetching next page: {next_link}")

                response = self.session.get(
                    next_link,
                    headers=headers,
                    timeout=(self.config.connect_timeout, self.config.read_timeout)
                )
                response.raise_for_status()

                data = response.json()
                features = data.get("features", [])
                all_features.extend(features)

                # Find next link
                next_link = None
                for link in data.get("links", []):
                    if link.get("rel") == "next":
                        next_link = link.get("href")
                        break

            # Trim to requested limit
            all_features = all_features[:limit]

            logger.info(f"[Search] Total products retrieved: {len(all_features)}")
            return all_features

        except requests.RequestException as e:
            logger.error(f"[Search] Request failed: {e}")

            # Log response body for debugging (limited)
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_body = e.response.text[:1000]
                    logger.error(f"[Search] Response body: {error_body}")
                except Exception:
                    pass

            raise RuntimeError(f"Product search failed: {e}")

    def download_asset(
        self,
        asset_href: str,
        dest_path: Path,
        chunk_size: int = 8 * 1024 * 1024  # 8 MB chunks
    ) -> Path:
        """
        Download a product asset (e.g., GeoTIFF)

        Args:
            asset_href: URL of the asset to download
            dest_path: Destination file path
            chunk_size: Download chunk size in bytes (default: 8 MB)

        Returns:
            Path to downloaded file

        Raises:
            RuntimeError: If download fails
        """
        logger.info(f"[Download] Asset: {asset_href}")
        logger.info(f"[Download] Destination: {dest_path}")

        # Create parent directories
        dest_path.parent.mkdir(parents=True, exist_ok=True)

        # Get auth token
        token = self._get_auth_token()

        headers = {
            "Authorization": f"Bearer {token}"
        }

        try:
            # Stream download
            with self.session.get(
                asset_href,
                headers=headers,
                stream=True,
                timeout=(self.config.connect_timeout, self.config.read_timeout)
            ) as response:

                if response.status_code == 401:
                    logger.error("[Download] Authentication failed (401)")
                    raise RuntimeError("Download authentication failed")

                response.raise_for_status()

                # Get total size if available
                total_size = response.headers.get("Content-Length")
                if total_size:
                    total_size = int(total_size)
                    logger.info(f"[Download] Total size: {total_size / 1024 / 1024:.2f} MB")

                # Download with progress logging
                downloaded = 0
                with open(dest_path, "wb") as f:
                    for chunk in response.iter_content(chunk_size=chunk_size):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)

                            # Log progress every ~50 MB
                            if downloaded % (50 * 1024 * 1024) < chunk_size:
                                downloaded_mb = downloaded / 1024 / 1024
                                if total_size:
                                    progress = (downloaded / total_size) * 100
                                    logger.info(
                                        f"[Download] Progress: {downloaded_mb:.1f} MB "
                                        f"({progress:.1f}%)"
                                    )
                                else:
                                    logger.info(f"[Download] Downloaded: {downloaded_mb:.1f} MB")

                final_size = downloaded / 1024 / 1024
                logger.info(f"[Download] ✅ Complete: {final_size:.2f} MB")

                return dest_path

        except requests.RequestException as e:
            logger.error(f"[Download] Failed: {e}")

            # Clean up partial download
            if dest_path.exists():
                dest_path.unlink()
                logger.debug(f"[Download] Removed partial file: {dest_path}")

            raise RuntimeError(f"Asset download failed: {e}")
