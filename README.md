![Node Version](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Status](https://img.shields.io/badge/status-MVP-orange)

# 🌍 GeoLens Europa

**GeoLens Europa** is an advanced, cloud-native geospatial platform designed to map and analyze **multi-hazard environmental risk across Europe**.  
It targets four main risk axes:

- **Water** – groundwater / recharge / surface stress (`water_score`)
- **Mass Movement** – landslide and slope instability (`landslide_score`)
- **Seismic Response** – regional hazard × local site conditions (`seismic_local_score`)
- **Resources** – mineral & critical raw material prospectivity (`mineral_score`)

The platform leverages modern web technologies to provide high-performance **2D, 2.5D and 3D** visualizations of complex datasets, moving beyond traditional heavy GIS clients.

---

## ❓ Why GeoLens Europa?

Traditional GIS systems:

- require heavy desktop clients or expensive servers,
- are not optimized for real-time interaction on **continent-scale** datasets,
- often treat each risk layer (water, seismic, landslides, resources) as a separate silo.

**GeoLens Europa** solves this by adopting a **Client-Side Compute**, **Static-First** and **Tile-First** architecture:

- Data is pre-processed into **PMTiles** (cloud-optimized archives).
- The browser fetches only the required spatial subset via **HTTP Range Requests**.
- Rendering and aggregation are pushed to the **GPU** using Deck.gl and CesiumJS.

The result: **fluid interactivity on multi-million cell datasets** directly in the browser, with a coherent **multi-hazard risk cube**.

---

## 🚀 Key Features

- **Cloud-Native Geospatial Architecture**
  - PMTiles for serverless, range-request-based data serving.
  - Works with static hosting or minimal edge infrastructure.

- **High-Performance Visualization**
  - **Deck.gl** + **MapLibre** for dense 2D / 2.5D rendering (hex bins, choropleths, vector tiles).
  - **H3 Hexagonal Indexing** (Uber) as the primary analysis unit across Europe.
  - **CesiumJS** for a photorealistic **3D globe**, cross-sections and vertical profiles.

- **Multi-Hazard Risk Cube (Concept)**
  - Each H3 cell holds a set of scores:
    - `water_score`, `landslide_score`, `seismic_local_score`, `mineral_score`.
  - Scores are computed from EU-wide datasets (DEM, landcover, hazard maps, geological datasets).
  - Designed to support:
    - site selection,
    - infrastructure planning,
    - resource scouting / risk screening.

- **AI-Powered Geospatial Analysis**
  - **Context-Aware RAG** for environmental risk:
    - Combines satellite imagery, terrain metrics and historical data into a single prompt.
    - Uses Gemini to validate or challenge model-based risk scores.
  - Future: **“Chat with Map”** for natural-language querying of geospatial context.

- **Modern Web Tech Stack**
  - Full TypeScript monorepo with:
    - **Next.js** (Frontend / App Router),
    - **Fastify** (Backend / API),
    - Shared geospatial logic in reusable packages.

---

## 🏗️ Technical Architecture

The project is structured as a monorepo using `npm workspaces` to ensure modularity and type safety across the full stack.

### Frontend – `apps/web`

- **Framework**: Next.js 14 (App Router, TypeScript).
- **2D Mapping**:
  - **Deck.gl** as the primary map controller (Parent Component) for robust event handling.
  - **MapLibre** synchronized as a background layer for base maps and vector tiles.
  - **H3 Hexagon Layers** for high-performance data visualization.
- **2.5D Terrain & Profiles**:
  - Terrain overlays using DEM-derived heightmaps.
  - Interactive elevation profiles along user-drawn transects (planned).
- **3D Mapping**:
  - **CesiumJS** via `resium` (React wrapper) for:
    - globe visualization,
    - draped risk layers,
    - future vertical cross-sections / hazard volumes.
- **State Management**:
  - React Hooks + URL state → shareable views and deep-links.
- **Styling**:
  - Tailwind CSS.

### Backend – `apps/api`

- **Framework**: Fastify (low overhead, great for tile / static serving).
- **Endpoints**:
  - `/tiles/...` – vector / raster tiles served from PMTiles.
  - `/cell/:h3Index` – returns the multi-hazard profile for a given H3 cell (mocked in MVP).
  - `/ai/analyze` – AI analysis endpoint (mocked in MVP, wired for Gemini).
- **Static / PMTiles Serving**:
  - `@fastify/static` with HTTP Range Requests:
    - the frontend fetches only the required byte ranges from a `.pmtiles` archive,
    - minimizing bandwidth and enabling serverless/edge deployments.

### Core Logic – `packages/*`

- **`core-geo`**
  - Isomorphic geospatial utilities:
    - H3 indexing (`h3-js`),
    - coordinate transformations,
    - helper functions for DEM-based metrics (slope, aspect, etc. – where supported in JS).

- **`geocube`**
  - Domain types and logic for risk scores:
    - `CellScore` type with:
      - `waterScore`, `landslideScore`, `seismicLocalScore`, `mineralScore`.
    - Placeholder functions for score computation from feature vectors.

- **`gemini-client`**
  - Typed wrappers for Google’s Generative AI:
    - `analyzeSatellitePatch(...)`
    - `analyzeGroundPhoto(...)`
    - `interpretGeoQuery(...)`
  - In the MVP, responses are simulated to avoid API costs.

### Data Pipeline – `scripts/ingest`

- **Ingestion & Conversion**
  - Node.js wrappers around **Tippecanoe**.
  - Converts raw GeoJSON / GeoTIFF into **PMTiles** archives.
- **Spatial Indexing**
  - Data is aggregated on **H3 resolutions 7–9** to create uniform analysis units.
- **Planned Inputs**
  - DEM (for slope, aspect, curvature).
  - Landslide susceptibility maps (ELSUS).
  - Seismic hazard maps (ESHM20).
  - Landcover / lithology / resource datasets (EGDI and others).

---

## 🤖 AI Integration (Context-Aware RAG)

The platform features a **Context-Aware Retrieval Augmented Generation (RAG)** pipeline for environmental risk assessment.

### General Flow

1. **User Interaction**
   - User clicks an H3 cell on the map.

2. **Context Retrieval**
   - The system retrieves:
     - numerical context:
       - slope, curvature, landcover,
       - landslide susceptibility class,
       - seismic hazard level,
       - (future) groundwater / resource indicators.
     - (optional) a satellite patch for that H3 cell.

3. **Prompt Construction**
   - A structured prompt combines:
     - numeric context,
     - H3 id,
     - satellite imagery (if available),
     - the specific **risk question** (e.g. landslide confirmation, site suitability, resource signals).

4. **LLM Inference**
   - Google Gemini analyzes the combined input and returns a JSON result.

### Example System Prompt (Landslide Axis)

```text
Role: Expert Geologist & Geomorphologist
Task: Analyze the satellite image and context for H3 cell {h3Index}.

Context Data:
- Slope Mean: 45 degrees (High)
- Landslide History: YES (2014 event)
- Soil Type: Clay
- Landcover: Discontinuous vegetation, patches of bare soil

Question:
Do you observe visual evidence (scars, vegetation gaps, displaced material, disrupted drainage)
that corroborates the high landslide risk indicated by the context data?

Output JSON:
{
  "risk_confirmation": boolean,
  "confidence": number, // 0–1
  "key_visual_clues": string[],
  "reasoning": string
}
```

*> Note: In the current MVP, the `/ai/analyze` endpoint returns simulated JSON responses to demonstrate the full UI flow without incurring actual API costs.*

---

## 🛠️ Getting Started

### Prerequisites

- **Node.js** (v18+)
- **npm** (v9+)
- **Tippecanoe** (for data ingestion)
  - macOS: `brew install tippecanoe`
  - or build from source on other platforms

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

---

## 🧭 Roadmap

-   [ ] **Phase 1 (Current)**: MVP with H3 grid, Deck.gl, PMTiles serving and mocked AI endpoint.
-   [ ] **Phase 2**: Integration with real Copernicus Sentinel-2 data and EU-wide DEM / hazard maps (ELSUS, ESHM20).
-   [ ] **Phase 3**: "Chat with Map" – natural language querying of geospatial context using Gemini (e.g. “show me stable, low-seismic regions with good water potential”).
-   [ ] **Phase 4**: Export of analysis reports (PDF, GeoJSON) for planning and documentation.
-   [ ] **Phase 5**: 3D cross-sections and volume views (terrain + subsurface layers where available).

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create a feature branch:
    ```bash
    git checkout -b feature/AmazingFeature
    ```
3.  Commit your changes:
    ```bash
    git commit -m "Add some AmazingFeature"
    ```
4.  Push to the branch:
    ```bash
    git push origin feature/AmazingFeature
    ```
5.  Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
