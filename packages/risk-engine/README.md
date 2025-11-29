# @geo-lens/risk-engine

**Deterministic and probabilistic risk computation engine for GeoLens Europa**

Version: `0.2.0-heuristic`

## Purpose

This package provides the **core numerical foundation** for multi-hazard risk assessment in GeoLens Europa. It is:

- ✅ **100% offline** - no external API calls
- ✅ **AI-independent** - uses deterministic/statistical models only
- ✅ **Transparent** - all formulas documented with scientific rationale
- ✅ **Extensible** - designed to accommodate future model improvements (ML, probabilistic frameworks)

## Installation

```bash
npm install @geo-lens/risk-engine
```

## Usage

### Basic Example

```typescript
import { computeLandslideRisk, CellFeatures } from '@geo-lens/risk-engine';

const features: CellFeatures = {
  slope: 35.0,        // degrees
  elsusClass: 4,      // ELSUS class 1-5
  elevation: 800,     // meters
  hazardPGA: 0.25     // Peak Ground Acceleration (g)
};

const result = computeLandslideRisk(features);

console.log(result.distribution.mean);      // 0.733 (risk score 0-1)
console.log(result.distribution.p_high);    // 0.75 (75% probability HIGH risk)
console.log(result.confidence);             // 1.0 (all required features present)
console.log(result.featuresUsed);           // ['slope', 'elsusClass']
```

### Compute All Risks

```typescript
import { computeAllRisks } from '@geo-lens/risk-engine';

const risks = computeAllRisks(features);

console.log(risks.landslide.distribution.mean);  // 0.733
console.log(risks.seismic.distribution.mean);    // 0.500
console.log(risks.water.distribution.mean);      // 0.350
console.log(risks.mineral.distribution.mean);    // 0.100
```

### Backward Compatibility

For legacy code expecting simple scores:

```typescript
import { computeSimpleScores } from '@geo-lens/risk-engine';

const scores = computeSimpleScores(features);

console.log(scores.landslideScore);  // 0.733
console.log(scores.seismicScore);    // 0.500
console.log(scores.waterScore);      // 0.350
console.log(scores.mineralScore);    // 0.100
```

## Risk Models

### 1. Landslide Risk (`computeLandslideRisk`)

**Features used:**
- `slope` (primary) - degrees
- `elsusClass` (secondary) - ELSUS susceptibility class 1-5

**Model (v0.2.0):**
```
slopeFactor = min(1, slope / 45°)
elsusFactor = (elsusClass - 1) / 4
riskMean = 0.6 * slopeFactor + 0.4 * elsusFactor
```

**Scientific basis:**
- 45° is typical angle of repose for loose materials
- ELSUS encodes historical/geological susceptibility
- Weighted average reflects slope as fundamental physical driver

**Future enhancements:**
- Rainfall triggers (rain24h, rain48h, rain72h)
- Soil moisture
- Statistical models calibrated on landslide inventory

---

### 2. Seismic Risk (`computeSeismicRisk`)

**Features used:**
- `hazardPGA` - Peak Ground Acceleration from ESHM20 (g)

**Model (v0.2.0):**
```
riskMean = normalize(PGA, 0, 0.5g) ^ 0.8
```

**Thresholds:**
- PGA < 0.1g → LOW risk
- PGA 0.1-0.3g → MODERATE risk
- PGA > 0.3g → HIGH risk

**Scientific basis:**
- Direct PGA mapping aligns with building code seismic classes
- Non-linear scaling (power 0.8) reflects actual damage curves

**Future enhancements:**
- Site amplification factors
- Full PSHA curves (return periods: 475yr, 2475yr)
- Integration with structural vulnerability models

---

### 3. Water Risk (`computeWaterRisk`)

**Features used:**
- `slope` (primary) - affects runoff/infiltration
- `clcClass` (secondary) - landcover effect on water retention

**Model (v0.2.0):**
```
stressFactor = slope / 20°
landCoverAdjustment = {
  forests (311-313): -0.1,
  urban (111-142): +0.15,
  wetlands (411-423): -0.2,
  other: 0
}
riskMean = clamp(stressFactor + landCoverAdjustment, 0, 1)
```

**Scientific basis:**
- Steeper slopes → faster runoff → less infiltration
- Forests increase infiltration
- Urban areas increase runoff

**LIMITATION:** This is a **terrain proxy** model. Real water stress requires precipitation, soil type, aquifer data.

**Future enhancements:**
- Actual precipitation data (rain24h, rain48h)
- Soil permeability
- Groundwater depth/recharge maps
- Drought indices

---

### 4. Mineral Prospectivity (`computeMineralRisk`)

**Features used:**
- `clcClass` - CLC class 131 (mineral extraction sites)
- `lithology` (future hook)

**Model (v0.2.0):**
```
if clcClass == 131:
  prospectivity = 0.9
else:
  prospectivity = 0.1
```

**LIMITATION:** This is a **placeholder** model. CLC 131 only identifies *existing* extraction sites, not undiscovered deposits.

**Scientific basis:** None yet - awaiting geological/geochemical data.

**Future enhancements:**
- Geological unit favorability
- Proximity to known deposits
- Geochemical stream sediment data
- Aeromagnetic/gravity anomalies
- Machine learning models trained on deposit databases

---

## Configuration

```typescript
import { RiskConfig, DEFAULT_RISK_CONFIG } from '@geo-lens/risk-engine';

const customConfig: RiskConfig = {
  missingDataStrategy: 'conservative',  // 'mean' | 'conservative' | 'fail'
  computeQuantiles: true,              // Include p10, p25, p50, p75, p90
  generateExplanations: true            // Include textual explanations
};

const result = computeLandslideRisk(features, customConfig);
console.log(result.explanation);  // Human-readable explanation
```

### Missing Data Strategies

- **`conservative`** (default): Assume moderate risk if data missing
- **`mean`**: Use neutral/average values
- **`fail`**: Throw error if required features missing

## API Reference

### Types

```typescript
interface CellFeatures {
  // Geophysical
  elevation?: number | null;
  slope?: number | null;
  demRoughness?: number | null;
  aspect?: number | null;
  curvature?: number | null;

  // Landslide
  elsusClass?: number | null;

  // Seismic
  hazardPGA?: number | null;
  hazardPGV?: number | null;

  // Land cover
  clcClass?: number | null;

  // Hydro-meteorological (future)
  rain24h?: number | null;
  rain48h?: number | null;
  rain72h?: number | null;
  soilMoisture?: number | null;
  snowWaterEquivalent?: number | null;

  // Geology (future)
  lithology?: string | null;
  permeability?: number | null;

  // Extensible
  [key: string]: number | string | boolean | null | undefined;
}

interface RiskDistribution {
  p_low: number;      // P(risk in [0, 0.33))
  p_medium: number;   // P(risk in [0.33, 0.67))
  p_high: number;     // P(risk in [0.67, 1])
  mean: number;       // Expected value [0, 1]
  variance: number;   // Uncertainty
  quantiles?: {       // Optional
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

interface RiskResult {
  distribution: RiskDistribution;
  featuresUsed: string[];
  featuresMissing: string[];
  confidence: number;           // [0, 1]
  explanation?: string;
  modelVersion: string;
}
```

### Functions

```typescript
// Individual risk types
computeLandslideRisk(features: CellFeatures, config?: RiskConfig): RiskResult
computeSeismicRisk(features: CellFeatures, config?: RiskConfig): RiskResult
computeWaterRisk(features: CellFeatures, config?: RiskConfig): RiskResult
computeMineralRisk(features: CellFeatures, config?: RiskConfig): RiskResult

// Convenience
computeAllRisks(features: CellFeatures, config?: RiskConfig): {
  landslide: RiskResult;
  seismic: RiskResult;
  water: RiskResult;
  mineral: RiskResult;
}

// Legacy compatibility
computeSimpleScores(features: CellFeatures): {
  waterScore: number;
  landslideScore: number;
  seismicScore: number;
  mineralScore: number;
}
```

## Development Roadmap

### v0.3.0 - Statistical Calibration
- [ ] Calibrate models against validation datasets
- [ ] Add proper uncertainty quantification
- [ ] Include historical event databases

### v0.4.0 - Precipitation Integration
- [ ] Integrate rainfall triggers for landslide model
- [ ] Add drought indices for water model
- [ ] Temporal dynamics (time-varying risk)

### v0.5.0 - Machine Learning
- [ ] ML-based mineral prospectivity (trained on deposit databases)
- [ ] Neural network for landslide susceptibility
- [ ] Ensemble models with uncertainty bounds

### v1.0.0 - Production-Ready
- [ ] Peer-reviewed model documentation
- [ ] Full validation reports
- [ ] Performance benchmarks
- [ ] Multi-temporal support (forecasting)

## Contributing

When adding/modifying risk models:

1. **Document the formula** in code comments
2. **Cite scientific basis** (papers, standards, expert knowledge)
3. **Include unit tests** with known ground truth
4. **Update this README** with model description
5. **Increment model version** in the file (e.g., `landslide-v0.3.0-rainfall`)

## License

MIT
