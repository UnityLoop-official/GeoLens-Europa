# GeoLens Europa - Web Application

This is the frontend application for GeoLens Europa, built with **Next.js 14** (App Router).

## 🗺️ Map Architecture

The map component (`apps/web/app/components/Map.tsx`) uses a **Deck.gl-first** architecture to ensure high-performance rendering and reliable event handling for the H3 hexagon grid.

### Structure

-   **`DeckGL` (Parent)**:
    -   Acts as the root component for the map view.
    -   Manages `viewState` (zoom, latitude, longitude, pitch).
    -   Handles all input events (clicks, hovers) to ensure reliable "picking" of H3 cells.
    -   Renders the `H3HexagonLayer` and other data layers.

-   **`MapLibre` (Child)**:
    -   Rendered *inside* Deck.gl as a child component.
    -   Synchronized with Deck.gl's view state.
    -   Provides the base map (cartography) and raster layers (e.g., Sentinel-2 satellite imagery).

### Key Components

-   **`Map.tsx`**: The main map controller. It orchestrates the state and renders the `DeckGL` provider.
-   **`MapOverlay.tsx`**: A helper module that exports `getOverlayLayers()`. It returns the configuration for the Deck.gl layers (specifically `TileLayer` -> `H3HexagonLayer`).
-   **`Sidebar.tsx`**: Displays detailed analysis for the selected H3 cell.

## 🛠️ Development

### Prerequisites

-   Node.js v18+
-   API running at `http://localhost:3001`

### Commands

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 📦 Key Dependencies

-   `deck.gl`: High-performance WebGL visualization.
-   `react-map-gl` / `maplibre-gl`: Base map rendering.
-   `h3-js`: Hexagonal hierarchical spatial index.
-   `tailwindcss`: Styling.
