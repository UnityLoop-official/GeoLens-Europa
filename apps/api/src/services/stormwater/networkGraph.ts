
import { latLngToCell, gridDisk, cellToLatLng } from 'h3-js';
import { getH3ScoresForArea, getDataForCells } from '../tileOrchestrator'; // For elevation/risk in future
import { StormwaterAsset } from './assetService';
import { distance } from '@geo-lens/core-geo'; // access to haversine or implement local
import { AreaRequest } from '../datasets/types';

// --- Types ---

export interface Node {
    id: string; // "node_lat_lon" or imported ID
    type: 'inlet' | 'manhole' | 'outfall' | 'vertex';
    pos: { lat: number; lon: number };
    elevation: number;
    h3Index: string; // Res 11 bucket
    attachedCatchments: string[]; // IDs of catchments draining here
}

export interface Edge {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    length: number;
    slope: number;
    assetId: string;
    props: Record<string, any>;
    // Runtime State
    flow_accumulated?: number;
}

export interface Network {
    id: string;
    nodes: Record<string, Node>;
    edges: Record<string, Edge>;
    assets: string[];
    stats: {
        nodeCount: number;
        edgeCount: number;
        snaps: number;
    };
}

// --- Helpers ---

// Simple Haversine if core-geo not available/compatible
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Distance from point to line segment (for catchment attachment)
function pointToSegmentDistance(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;
    const dot = A * C + B * D;
    const len_sq = C * C + D * D;
    let param = -1;
    if (len_sq != 0) // in case of 0 length line
        param = dot / len_sq;
    let xx, yy;
    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * C;
        yy = y1 + param * D;
    }
    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy); // This is effectively deg distance if coords are deg
}

// --- Builder ---

export class NetworkBuilder {
    private nodes: Map<string, Node> = new Map();
    private edges: Map<string, Edge> = new Map();
    private h3IndexMap: Map<string, string[]> = new Map(); // h3Index -> nodeIds
    private snapToleranceM = 5;

    constructor() {
        const envTol = process.env.SNAP_TOLERANCE_M;
        if (envTol) this.snapToleranceM = parseFloat(envTol);
    }

    private getSpatialBuckets(lat: number, lon: number): string[] {
        const center = latLngToCell(lat, lon, 11);
        return gridDisk(center, 1); // Center + 1 ring
    }

    private findSnapCandidate(lat: number, lon: number): { nodeId: string; dist: number } | null {
        const buckets = this.getSpatialBuckets(lat, lon);
        let bestNodeId: string | null = null;
        let minDist = this.snapToleranceM;

        for (const bucket of buckets) {
            const candidates = this.h3IndexMap.get(bucket) || [];
            for (const candId of candidates) {
                const cand = this.nodes.get(candId);
                if (!cand) continue;
                const dist = haversineDistance(lat, lon, cand.pos.lat, cand.pos.lon);
                if (dist < minDist) {
                    minDist = dist;
                    bestNodeId = candId;
                }
            }
        }
        return bestNodeId ? { nodeId: bestNodeId, dist: minDist } : null;
    }

    private addNode(lat: number, lon: number, type: Node['type'], existingId?: string): Node {
        // Check snap first
        const snap = this.findSnapCandidate(lat, lon);
        if (snap) {
            // If snapping to existing, we prefer the 'stronger' type (e.g. manhole > vertex)
            // But for V0, just return existing
            // TODO: Merge properties / update ID alias?
            return this.nodes.get(snap.nodeId)!;
        }

        // Create new
        const id = existingId || `node_${lat.toFixed(6)}_${lon.toFixed(6)}`;
        const h3 = latLngToCell(lat, lon, 11);

        const node: Node = {
            id,
            type,
            pos: { lat, lon },
            elevation: 0, // Placeholder
            h3Index: h3,
            attachedCatchments: []
        };

        this.nodes.set(id, node);

        if (!this.h3IndexMap.has(h3)) this.h3IndexMap.set(h3, []);
        this.h3IndexMap.get(h3)!.push(id);

        return node;
    }

    public build(assets: StormwaterAsset[]): Network {
        let snapCount = 0;

        // 1. Process POINT assets first (Manholes, Inlets, Outfalls) to establish fixed nodes
        assets.filter(a => a.geometry.type === 'Point').forEach(asset => {
            const [lon, lat] = (asset.geometry as any).coordinates;
            // Provide asset ID as preferred ID
            const type = (asset.properties.type as any) || 'manhole';
            this.addNode(lat, lon, type, asset.id);
        });

        // 2. Process PIPES (LineStrings)
        assets.filter(a => a.geometry.type === 'LineString').forEach(asset => {
            const coords = (asset.geometry as any).coordinates;
            if (coords.length < 2) return;

            const start = coords[0];
            const end = coords[coords.length - 1];

            // Snap Start
            const startSnap = this.findSnapCandidate(start[1], start[0]);
            let startNode: Node;
            if (startSnap) {
                snapCount++;
                startNode = this.nodes.get(startSnap.nodeId)!;
            } else {
                startNode = this.addNode(start[1], start[0], 'vertex');
            }

            // Snap End
            const endSnap = this.findSnapCandidate(end[1], end[0]);
            let endNode: Node;
            if (endSnap) {
                snapCount++;
                endNode = this.nodes.get(endSnap.nodeId)!;
            } else {
                endNode = this.addNode(end[1], end[0], 'vertex');
            }

            // Create Edge
            // Calculate length
            // For MVP assuming straight line distance between nodes, but strictly should sum segments
            const len = haversineDistance(startNode.pos.lat, startNode.pos.lon, endNode.pos.lat, endNode.pos.lon);

            // Orientation: Default geometry order (start -> end)
            // Elevation check will be added later
            const edge: Edge = {
                id: `edge_${asset.id}`,
                fromNodeId: startNode.id,
                toNodeId: endNode.id,
                length: len,
                slope: 0, // Todo
                assetId: asset.id,
                props: asset.properties
            };
            this.edges.set(edge.id, edge);
        });

        // 3. Attach Catchments (Centroid -> Nearest Node)
        assets.filter(a => a.type === 'catchment').forEach(asset => {
            // Find centroid (simplified)
            let lat = 0, lon = 0;
            if (asset.geometry.type === 'Polygon') {
                const ring = (asset.geometry as any).coordinates[0];
                for (const p of ring) { lon += p[0]; lat += p[1]; }
                lon /= ring.length;
                lat /= ring.length;
            } else {
                // Warning or skip
                return;
            }

            // Find nearest node (Global search? Or bucket?)
            // Bucket search around centroid
            const snap = this.findSnapCandidate(lat, lon); // Reusing snap logic but maybe wider radius?
            // Use wider search if snap fails?
            // For MVP, just scan all nodes (Limits are 2000 nodes, so cheap)
            let nearestId = '';
            let minDist = Infinity;

            for (const node of this.nodes.values()) {
                const d = haversineDistance(lat, lon, node.pos.lat, node.pos.lon);
                if (d < minDist) {
                    minDist = d;
                    nearestId = node.id;
                }
            }

            if (nearestId) {
                const n = this.nodes.get(nearestId)!;
                n.attachedCatchments.push(asset.id);
            }
        });

        return {
            id: `net_${Date.now()}`,
            nodes: Object.fromEntries(this.nodes),
            edges: Object.fromEntries(this.edges),
            assets: assets.map(a => a.id),
            stats: {
                nodeCount: this.nodes.size,
                edgeCount: this.edges.size,
                snaps: snapCount
            }
        };
    }

    // --- Phase 2: Elevation & Orientation ---

    public async enrichWithElevation(net: Network): Promise<void> {
        // 1. Collect unique H3s
        // Actually, we stored h3Index on Node. But strictly we should use 'dem' sampling which might be a different res?
        // Let's assume Node H3 is fine.
        const nodeIds = Object.keys(net.nodes);
        const cellIds = [...new Set(Object.values(net.nodes).map(n => n.h3Index))];

        // 2. Fetch Data (DEM)
        const data = await getDataForCells(cellIds, ['dem']);
        const elevationMap = new Map<string, number>();
        data.forEach((d: any) => {
            // d has { elevation, ... }
            // Only if real data; if missing, might be 0 or undefined.
            if (typeof d.elevation === 'number') {
                elevationMap.set(d.h3Index, d.elevation);
            }
        });

        // 3. Apply to Nodes
        for (const nid of nodeIds) {
            const node = net.nodes[nid];
            const el = elevationMap.get(node.h3Index);
            if (el !== undefined) {
                node.elevation = el;
            }
        }
    }

    public orientEdges(net: Network) {
        for (const eid in net.edges) {
            const edge = net.edges[eid];
            const nodeFrom = net.nodes[edge.fromNodeId];
            const nodeTo = net.nodes[edge.toNodeId];

            if (!nodeFrom || !nodeTo) continue;

            const dz = nodeFrom.elevation - nodeTo.elevation;
            const slope = dz / edge.length; // rise/run

            const MIN_SLOPE_EPS = 0.001; // 0.1%

            if (Math.abs(slope) < MIN_SLOPE_EPS) {
                // Too flat to determine direction confidently
                edge.slope = slope;
                edge.props.direction = 'unknown'; // Flag for risk engine
                edge.props.isFlat = true;
            } else if (slope < 0) {
                // Uphill: Swap to make it downhill
                const temp = edge.fromNodeId;
                edge.fromNodeId = edge.toNodeId;
                edge.toNodeId = temp;
                edge.slope = -slope; // positive value indicating downhill grade
                edge.props.direction = 'downhill';
            } else {
                edge.slope = slope;
                edge.props.direction = 'downhill';
            }
        }
    }

    // --- Phase 3: Risk Engine ---

    public async computeRisk(net: Network, profile: string = 'stormwater'): Promise<{ nodes: any, edges: any, risk_stats: any }> {

        // 1. Calculate Local Inflow (Source Term)
        // For each node, sum "runoff_risk" from attached catchments.
        // We need runoff scores for all attached catchment cells.

        // Gather all catchment cells
        const allCatchments = net.assets.filter(aid => aid.startsWith('catchment_')); // bit hacky, strict check better
        // Alternatively iterate nodes

        // Let's do a bulk fetch for all catchment cells if possible, OR just iterate Nodes.
        // Simplified: Iterate nodes.
        const nodeFlows = new Map<string, number>();
        const nodeRisks = new Map<string, { total: number, max: number }>();

        // We need a way to get "runoff_risk" for a cell. 
        // We can reuse `getDataForCells` with 'stormwater' profile layers (precip, clc, slope).
        // Then calculate risk manually? Or use `computeRunoffRisk`.
        const { computeRunoffRisk } = require('../stormwater/runoffRisk');

        // Let's get all engaged cells (Nodes + Catchments)
        // Wait, catchment is a polygon. We didn't store its cells in the Asset object in previous steps?
        // AssetService import stores cells? "importAssets" does "polyfill". Yes!

        const { getAssetsByIds } = require('./assetService');
        const assets = getAssetsByIds(net.assets);
        const assetsMap = new Map(assets.map((a: any) => [a.id, a]));

        // Collect all cells to fetch
        const cellsToFetch = new Set<string>();
        for (const node of Object.values(net.nodes)) {
            for (const cid of node.attachedCatchments) {
                const cAsset = assetsMap.get(cid);
                if (cAsset && cAsset.h3Cells) {
                    cAsset.h3Cells.forEach((h: string) => cellsToFetch.add(h));
                }
            }
            // Also add node's own cell (direct rainfall on inlet)
            cellsToFetch.add(node.h3Index);
        }

        // Batch fetch
        // Note: We need 'precipitation', 'clc', 'dem' for runoff
        const rawData = await getDataForCells([...cellsToFetch], ['precipitation', 'clc', 'dem']);
        const cellDataMap = new Map<string, any>();
        rawData.forEach((d: any) => cellDataMap.set(d.h3Index, d));

        // Compute Local Inflow
        for (const nid in net.nodes) {
            const node = net.nodes[nid];
            let localFlow = 0;
            let maxRisk = 0;

            const contribute = (h3: string) => {
                const d = cellDataMap.get(h3);
                if (!d) return;
                // Compute Risk
                const risk = computeRunoffRisk({
                    rain24h_mm: d.precipitation_mm || 0,
                    clc_code: d.clc_code || 999,
                    slope_deg: d.slope || 0
                });

                // Flow = Risk [0-1] * Area (approx).
                // H3 Res 11 Area ~ ? Res 11 is small (~500m2?)
                // Let's treat risk score as "Volume Unit" for MVP.
                localFlow += risk.riskScore;
                if (risk.riskScore > maxRisk) maxRisk = risk.riskScore;
            };

            // Catchments
            for (const cid of node.attachedCatchments) {
                const cAsset = assetsMap.get(cid);
                if (cAsset && cAsset.h3Cells) cAsset.h3Cells.forEach(contribute);
            }
            // Node itself
            contribute(node.h3Index);

            nodeFlows.set(nid, localFlow);
            nodeRisks.set(nid, { total: localFlow, max: maxRisk });
        }

        // 2. Propagation (Iterative)
        const flowState = new Map(nodeFlows); // Current flow at node (accumulated)
        const edgeFlows = new Map<string, number>(); // Flow passing through edge

        const ITERATIONS = 20; // Convergence limit
        const DECAY_K = 0.001; // 0.1% per meter
        const DAMPING = 0.5; // Prevent oscillation in cycles

        for (let iter = 0; iter < ITERATIONS; iter++) {
            const nextFlowState = new Map(nodeFlows); // Reset to Local Inflow base (Source)

            // Push flow from Upstream to Downstream
            for (const eid in net.edges) {
                const edge = net.edges[eid];
                const q_in = flowState.get(edge.fromNodeId) || 0;

                // Handle Unknown Direction: Bi-directional split or blocking?
                // Strategy: If unknown, flow 50% capacity both ways? Or treat as flat/blocked?
                // MVP: Treat as From->To but with higher resistance/decay
                const isUnknown = edge.props.direction === 'unknown';

                // Only propagate if there is flow
                if (q_in > 0.001) {
                    // Decay
                    let decay = Math.exp(-DECAY_K * edge.length);
                    if (isUnknown) decay *= 0.5; // Penalize unknown direction

                    const q_out = q_in * decay;

                    // Add to downstream
                    const current = nextFlowState.get(edge.toNodeId) || 0;

                    // Simple accumulation might double count in cycles? 
                    // No, `nextFlowState` is rebuilt from sources each iter + incoming.
                    // But we must not ADD `q_in` from `flowState` if it was already *transferred*.
                    // Wait, this is a steady-state solver logic: Flow_at_Node = Source + Sum(Incoming_Edges).

                    nextFlowState.set(edge.toNodeId, current + q_out);

                    // Track edge flow (max seen?)
                    edgeFlows.set(eid, q_out);
                }
            }

            // Damping / Convergence check
            let maxDelta = 0;
            for (const [nid, q_new] of nextFlowState) {
                const q_old = flowState.get(nid) || 0;
                // Apply damping? q_final = (1-d)*q_old + d*q_new
                // Helps stability
                const q_damped = (1 - DAMPING) * q_old + DAMPING * q_new;

                const d = Math.abs(q_damped - q_old);
                if (d > maxDelta) maxDelta = d;

                flowState.set(nid, q_damped); // Or q_damped? Let's iterate towards stable solution
            }

            if (maxDelta < 0.01) break; // Converged
        }

        // 3. Return Stats
        const nodeResults: any = {};
        for (const nid in net.nodes) {
            nodeResults[nid] = {
                local_inflow: nodeFlows.get(nid),
                flow_accumulated: flowState.get(nid),
                risk_max: nodeRisks.get(nid)?.max
            };
        }

        const edgeResults: any = {};
        for (const eid in net.edges) {
            edgeResults[eid] = {
                flow: edgeFlows.get(eid) || 0,
                direction: net.edges[eid].props.direction
            };
        }

        return {
            nodes: nodeResults,
            edges: edgeResults,
            risk_stats: { iterations: ITERATIONS } // Report actual iters?
        };
    }
}
