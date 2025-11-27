# 🌍 GeoLens Europa

**GeoLens Europa** is a state-of-the-art, cloud-native geospatial platform designed to map and analyze environmental risks across Europe. It leverages modern web technologies to provide high-performance 2D and 3D visualizations of complex datasets.

![GeoLens Europa Banner](https://via.placeholder.com/1200x400?text=GeoLens+Europa+Preview)

## 🚀 Key Features

-   **Cloud-Native Geospatial Architecture**: Built for scale using **PMTiles** for serverless, range-request based data serving.
-   **High-Performance Visualization**:
    -   **Deck.gl** & **MapLibre** integration for rendering millions of data points.
    -   **H3 Hexagonal Indexing** (Uber) for efficient spatial binning and analysis.
    -   **CesiumJS** for photorealistic 3D globe visualization.
-   **AI-Powered Analysis**:
    -   **Context-Aware RAG**: Integrates satellite imagery with vector data (slope, landslide history) to prompt Gemini AI for risk assessment.
-   **Modern Tech Stack**: Full TypeScript monorepo with Next.js (Frontend) and Fastify (Backend).

## 🏗️ Architecture

The project is structured as a Monorepo using `npm workspaces`:

-   **`apps/web`**: Next.js 14 frontend. Handles the UI, Map/Globe rendering, and AI interaction.
-   **`apps/api`**: Fastify backend. Serves static tiles and handles AI proxying.
-   **`packages/core-geo`**: Shared geospatial utilities (H3 logic, math helpers).
-   **`packages/geocube`**: Domain types and scoring logic.
-   **`packages/gemini-client`**: AI client wrappers for Google Gemini.
-   **`scripts/ingest`**: Node.js pipelines for converting raw GeoJSON to PMTiles using `tippecanoe`.

## 🛠️ Getting Started

### Prerequisites

-   **Node.js** (v18+)
-   **npm** (v9+)
-   **Tippecanoe** (for data ingestion, install via `brew install tippecanoe` or build from source)
-   **Docker** (optional, for PostGIS)

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

## 📦 Data Pipeline

We use a "Static-First" approach for data. Instead of heavy database queries for tiles, we pre-process data into **PMTiles**.

1.  **Place Data**: Put your raw GeoJSON files in the `data/` folder.
2.  **Run Ingestion**:
    ```bash
    npx ts-node scripts/ingest/generate-tiles.ts
    ```
    This script uses `tippecanoe` to generate optimized archives in `apps/api/public/tiles/`.

## 🤖 AI Integration

The "Analyze Patch" feature uses a mocked RAG pipeline. To enable real AI:
1.  Get a Google Gemini API Key.
2.  Update `packages/gemini-client` to use the real API.
3.  The system will send the H3 index, satellite image, and context data (slope, history) to the LLM.

## 📄 License

MIT
