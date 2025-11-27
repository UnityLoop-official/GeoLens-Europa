# 🌍 GeoLens Europa

![Node Version](https://img.shields.io/badge/node-%3E%3D18-green) ![License](https://img.shields.io/badge/license-MIT-blue) ![Status](https://img.shields.io/badge/status-MVP-orange)

**GeoLens Europa** is an advanced, cloud-native geospatial platform designed to map and analyze environmental risks across Europe. It leverages modern web technologies to provide high-performance 2D and 3D visualizations of complex datasets, moving beyond traditional heavy GIS clients.

## ❓ Why GeoLens Europa?

Traditional GIS systems often require expensive servers, proprietary desktop software, and struggle to scale for real-time analysis on millions of data points. **GeoLens Europa** solves this by adopting a **Client-Side Compute** and **Static-First** architecture. By streaming optimized vector tiles (PMTiles) and using the GPU for rendering (Deck.gl), we achieve fluid interactivity even with massive datasets, directly in the browser.

## 🚀 Key Features

-   **Cloud-Native Geospatial Architecture**: Built for scale using **PMTiles** for serverless, range-request based data serving.
-   **High-Performance Visualization**:
    -   **Deck.gl** & **MapLibre** integration for rendering millions of data points.
    -   **H3 Hexagonal Indexing** (Uber) for efficient spatial binning and analysis.
    -   **CesiumJS** for photorealistic 3D globe visualization.
-   **AI-Powered Analysis**:
    -   **Context-Aware RAG**: Integrates satellite imagery with vector data (slope, landslide history) to prompt Gemini AI for risk assessment.
-   **Modern Tech Stack**: Full TypeScript monorepo with Next.js (Frontend) and Fastify (Backend).

## 🏗️ Technical Architecture

The project is structured as a Monorepo using `npm workspaces` to ensure modularity and type safety across the full stack.

### Frontend (`apps/web`)
-   **Framework**: Next.js 14 (App Router).
-   **2D Mapping**: `react-map-gl` + `maplibre-gl` with `@deck.gl/mapbox` overlay.
-   **3D Mapping**: `resium` (React wrapper for CesiumJS).
-   **State Management**: React Hooks + URL state for shareable views.
-   **Styling**: Tailwind CSS.

### Backend (`apps/api`)
-   **Framework**: Fastify (chosen for low overhead).
-   **Data Serving**: `@fastify/static` configured for **HTTP Range Requests**. This allows the frontend to fetch only the specific bytes of a `.pmtiles` archive needed for the current view, drastically reducing bandwidth.

### Core Logic (`packages/*`)
-   **`core-geo`**: Isomorphic utilities for H3 indexing (`h3-js`) and coordinate projection.
-   **`geocube`**: TypeScript definitions for `CellScore` and domain logic.
-   **`gemini-client`**: Typed wrappers for Google's Generative AI.

### Data Pipeline (`scripts/ingest`)
-   **Ingestion**: Node.js wrappers around **Tippecanoe**.
-   **Format**: Converts raw GeoJSON/GeoTIFF into **PMTiles** (Cloud-Optimized Archives).
-   **Indexing**: Data is spatially indexed using H3 resolution 7-9 for uniform analysis units.

## 🤖 AI Integration (RAG Pipeline)

The platform features a **Context-Aware Retrieval Augmented Generation (RAG)** pipeline for environmental risk assessment.

### Data Flow
1.  **User Interaction**: User clicks a cell (H3 Index).
2.  **Context Retrieval**: System fetches vector data for that cell (Slope, Landslide Susceptibility, Lithology).
3.  **Prompt Construction**: A structured prompt combines the visual data (Satellite) with the vector context.
4.  **LLM Inference**: Google Gemini analyzes the combined input.

### Example System Prompt
```text
Role: Expert Geologist
Task: Analyze the satellite image for H3 cell {h3Index}.
Context Data:
- Slope Mean: 45 degrees (High)
- Landslide History: YES (2014 event)
- Soil Type: Clay

Question: Do you observe visual evidence (scarring, vegetation gaps) that corroborates the high landslide risk indicated by the context data?
Output: JSON { "risk_confirmation": boolean, "confidence": 0-1, "reasoning": "..." }
```

*> Note: The current MVP uses a simulated response for the AI endpoint to demonstrate the UI flow without incurring API costs.*

## 🛠️ Getting Started

### Prerequisites

-   **Node.js** (v18+)
-   **npm** (v9+)
-   **Tippecanoe** (for data ingestion, install via `brew install tippecanoe` or build from source)

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/Daniele-Cangi/GeoLens-Europa.git
    cd GeoLens-Europa
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

### Running Locally

Start the development environment (Frontend + Backend):

```bash
npm run dev --workspaces
```

-   **Frontend**: [http://localhost:3000](http://localhost:3000)
-   **Backend**: [http://localhost:3001](http://localhost:3001)

## �️ Roadmap

-   [ ] **Phase 1 (Current)**: MVP with H3 Grid, Deck.gl, and Mock AI.
-   [ ] **Phase 2**: Integration with real Copernicus Sentinel-2 data.
-   [ ] **Phase 3**: "Chat with Map" feature (Natural Language Querying of geospatial data).
-   [ ] **Phase 4**: Export analysis reports in PDF/GeoJSON.

## � Contributing

Contributions are welcome! Please follow these steps:
1.  Fork the repository.
2.  Create a feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
