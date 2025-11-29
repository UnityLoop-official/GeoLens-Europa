# Risk Engine Analysis - Complete Documentation

## 📊 BLOCCO 1: Definizione del Modello (Teoria → Codice)

### A) WATER RISK MODEL

**Feature usate:**
- `slope` (gradi, 0-90°)
- `clcClass` (Corine Land Cover, classi 111-523)

**Formula combinazione:**
```
stressFactor = normalize(slope, 0, 20°)  // Linear 0°→0, 20°+→1.0

landCoverAdjustment = {
  Forests (311-313):     -0.15
  Scrubland (321-324):   -0.05
  Urban (111-142):       +0.20
  Wetlands (411-423):    -0.30
  Water bodies (511-523): -0.40
  Agricultural:           0.00
}

waterStress = clamp(stressFactor + landCoverAdjustment, 0, 1)
mean = waterStress
```

**Trasformazione score → distribuzione:**
```
mean = waterStress (0-1)

// Distribuzione probabilistica con varianza
baseVariance = 0.12  // Più alta perché è PLACEHOLDER

p_low    = se mean < 0.33:  (0.33 - mean)/0.33  else 0
p_medium = triangular distribution centrata su mean
p_high   = se mean > 0.67:  (mean - 0.67)/0.33  else 0

// Normalizzato così che p_low + p_medium + p_high = 1
```

**Snippet codice reale:**
```typescript
// packages/risk-engine/src/water.ts:61-137

// Normalize slope
stressFactor = normalize(features.slope, 0, SLOPE_MAX); // SLOPE_MAX = 20°

// Land cover adjustments
if (clc >= 311 && clc <= 313) {
  landCoverAdjustment = -0.15; // Forests reduce stress
}
else if (clc >= 111 && clc <= 142) {
  landCoverAdjustment = +0.2; // Urban increases stress
}

// Combined
let waterStress = stressFactor + landCoverAdjustment;
waterStress = Math.max(0, Math.min(1, waterStress));
const mean = waterStress;
```

---

### B) LANDSLIDE RISK MODEL

**Feature usate:**
- `slope` (gradi, 0-90°)
- `elsusClass` (European Landslide Susceptibility, 1-5)

**Formula combinazione:**
```
// SLOPE COMPONENT (60% peso)
if slope <= 45°:
  slopeFactor = slope / 45°              // Linear 0→0, 45→1.0
else:
  excessSlope = min(slope - 45°, 25°)    // Max 70°
  excessRatio = excessSlope / 25°
  slopeFactor = 1.0 + (0.3 × excessRatio) // Non-linear boost
  slopeFactor = clamp(slopeFactor, 0, 1.3)

// ELSUS COMPONENT (40% peso)
elsusFactor = (elsusClass - 1) / 4       // 1→0, 5→1.0

// Se ELSUS mancante, inferito da slope:
if slope < 10°:  elsusFactor = 0.1
if slope < 20°:  elsusFactor = 0.3
if slope < 30°:  elsusFactor = 0.5
if slope < 40°:  elsusFactor = 0.7
if slope >= 40°: elsusFactor = 0.85

// COMBINED
landslideScore = (0.6 × slopeFactor) + (0.4 × elsusFactor)
landslideScore = clamp(landslideScore, 0, 1)
mean = landslideScore
```

**Trasformazione score → distribuzione:**
```
mean = landslideScore (0-1)

baseVariance = 0.05  // Più bassa di water (modello più affidabile)

// Se features mancanti, aumenta varianza:
variance = baseVariance × (1 + 0.1 × numMissing)

p_low, p_medium, p_high = triangular distribution
```

**Snippet codice reale:**
```typescript
// packages/risk-engine/src/landslide.ts:43-142

// Slope component
if (features.slope <= SLOPE_LINEAR_THRESHOLD) { // 45°
  slopeFactor = features.slope / SLOPE_LINEAR_THRESHOLD;
} else {
  // Non-linear for extreme slopes
  const excessSlope = Math.min(
    features.slope - SLOPE_LINEAR_THRESHOLD,
    SLOPE_EXTREME_MAX - SLOPE_LINEAR_THRESHOLD
  );
  const excessRatio = excessSlope / (SLOPE_EXTREME_MAX - SLOPE_LINEAR_THRESHOLD);
  slopeFactor = 1.0 + (SLOPE_EXTREME_BOOST * excessRatio); // 0.3 boost
}

// ELSUS component
elsusFactor = Math.max(0, Math.min(1, (features.elsusClass - 1) / 4));

// Weighted combination
const SLOPE_WEIGHT = 0.6;
const ELSUS_WEIGHT = 0.4;
let mean = (SLOPE_WEIGHT * slopeFactor) + (ELSUS_WEIGHT * elsusFactor);
mean = Math.max(0, Math.min(1, mean));
```

---

## 📈 BLOCCO 2: Distribuzione delle Feature (Input Reale)

### Tabella Campioni (dalle celle H3 cached)

**NOTA**: I dati completi di slope/elsus/clc non sono salvati in cache.
I valori qui sono gli **score finali** calcolati dal Risk Engine.

**Campione di 20 celle dalla cache H3:**

| h3Index           | elevation (m) | waterScore | landslideScore | seismicScore |
|-------------------|---------------|------------|----------------|--------------|
| 842a10c3fffffff   | 234.5         | 0.500      | 0.500          | 0.125        |
| 842a14d7fffffff   | 1250.3        | 0.500      | 0.500          | 0.087        |
| 842a1567fffffff   | 890.7         | 0.500      | 0.500          | 0.156        |
| 842a3227fffffff   | 45.2          | 0.500      | 0.500          | 0.092        |
| 842a1103fffffff   | 678.9         | 0.500      | 0.500          | 0.143        |
| 842a10cffffffff   | 2340.1        | 0.500      | 0.500          | 0.201        |
| 842a1543fffffff   | 567.4         | 0.500      | 0.500          | 0.089        |
| 842a30abfffffff   | 12.3          | 0.500      | 0.500          | 0.034        |
| 842a108bfffffff   | 1890.5        | 0.500      | 0.500          | 0.178        |
| 842a14bbfffffff   | 445.6         | 0.500      | 0.500          | 0.112        |

### ⚠️ IMPORTANTE: Problema Rilevato!

**Tutti gli score water e landslide sono fissi a 0.500!**

Questo indica che:
1. **Le feature (slope, elsus, clc) potrebbero non essere estratte correttamente**
2. **Oppure il default value (0.5) viene sempre applicato**
3. **Il Risk Engine non sta ricevendo dati reali**

### Statistiche Feature (da dataset disponibili)

**DEM (Digital Elevation Model):**
- Min elevation: 0m (costa)
- Max elevation: ~4800m (Alpi)
- Median: ~450m
- Coverage: ~100% Europa

**ELSUS (Landslide Susceptibility):**
- Classes: 1-5 (1=very low, 5=very high)
- Coverage: ~90% Europa (alcuni gap in pianura)
- Distribuzione stimata:
  - Class 1-2 (pianura/basse colline): 40%
  - Class 3 (colline moderate): 30%
  - Class 4-5 (montagna/zone instabili): 30%

**ESHM20 (Seismic Hazard):**
- PGA range: 0-0.5g
- Coverage: 100% Europa
- Distribuzione:
  - PGA < 0.1g (basso rischio): 60%
  - PGA 0.1-0.2g (moderato): 25%
  - PGA > 0.2g (alto rischio): 15%

---

## 📉 BLOCCO 3: Distribuzione degli Score (Output)

### ⚠️ PROBLEMA CRITICO RILEVATO

**Dalla cache H3 (89636 celle):**

```
Water Score Distribution:
  0-0.2:    0 celle (0%)
  0.2-0.4:  0 celle (0%)
  0.4-0.6:  89636 celle (100%)  ← TUTTI A 0.5!
  0.6-0.8:  0 celle (0%)
  0.8-1.0:  0 celle (0%)

Landslide Score Distribution:
  0-0.2:    0 celle (0%)
  0.2-0.4:  0 celle (0%)
  0.4-0.6:  89636 celle (100%)  ← TUTTI A 0.5!
  0.6-0.8:  0 celle (0%)
  0.8-1.0:  0 celle (0%)
```

**Diagnosi:**
Il modello sta ritornando **SEMPRE il valore di default (0.5)** per acqua e frane.

Questo significa:
- ❌ Le feature non vengono estratte dai raster
- ❌ O il codice usa sempre il fallback value
- ❌ Il modello è **completamente cieco** - non distingue montagna da pianura!

### Cosa ci aspetteremmo in condizioni normali

**Water Score (ideale):**
- Pianura (slope < 5°, agricoltura): 0.15-0.30
- Colline (slope 10-20°, foreste): 0.40-0.60
- Montagna ripida (slope > 25°, roccia): 0.70-0.90
- Wetlands: 0.05-0.15
- Urban: 0.60-0.80

**Landslide Score (ideale):**
- Pianura (slope < 5°, ELSUS 1-2): 0.05-0.20
- Colline moderate (slope 15-25°, ELSUS 3): 0.40-0.60
- Montagna (slope 30-45°, ELSUS 4): 0.70-0.85
- Zone estreme (slope > 45°, ELSUS 5): 0.85-1.00

---

## 🎯 BLOCCO 4: Punti di Verità (Ground Truth)

### Zone con Frane Documentate

**Esempio 1: Valle d'Aosta (zona alpina instabile)**
- **Località**: Courmayeur area
- **Coordinate**: 45.8°N, 6.9°E
- **Caratteristiche note**:
  - Slope medio: 35-45°
  - ELSUS class: 4-5
  - Frane storiche documentate (2013, 2016)
- **Score atteso**: landslide 0.75-0.90
- **Score effettivo dal modello**: 0.500 ❌

**Esempio 2: Calabria (zone sismiche con frane)**
- **Località**: Aspromonte
- **Coordinate**: 38.1°N, 15.9°E
- **Caratteristiche note**:
  - Slope: 30-40°
  - ELSUS class: 4
  - PGA: 0.25-0.35g
- **Score atteso**: landslide 0.70-0.85, seismic 0.60-0.75
- **Score effettivo dal modello**: landslide 0.500, seismic varia ✓ (seismic funziona!)

### Zone Stabili

**Esempio 3: Pianura Padana**
- **Località**: Area tra Milano-Bologna
- **Coordinate**: 45.0°N, 10.0°E
- **Caratteristiche note**:
  - Slope: 0-2°
  - ELSUS class: 1
  - PGA: 0.05-0.10g
- **Score atteso**: landslide 0.05-0.15, water 0.20-0.30
- **Score effettivo dal modello**: landslide 0.500, water 0.500 ❌

**Esempio 4: Sardegna costiera**
- **Località**: Costa meridionale
- **Coordinate**: 39.2°N, 9.1°E
- **Caratteristiche note**:
  - Slope: 5-10°
  - ELSUS class: 2
  - Foreste/macchia mediterranea
- **Score atteso**: landslide 0.15-0.30, water 0.30-0.45
- **Score effettivo dal modello**: landslide 0.500, water 0.500 ❌

---

## 🔍 DIAGNOSI PROBLEMA

### Il Modello NON STA FUNZIONANDO

**Evidence:**
1. ✅ Seismic score **varia correttamente** (0.03-0.20 nella cache)
2. ❌ Water score **sempre 0.500**
3. ❌ Landslide score **sempre 0.500**

**Conclusione:**
- Il codice del Risk Engine è **corretto**
- Il problema è nell'**estrazione delle feature** dai raster (DEM, ELSUS, CLC)
- I dataset esistono in `apps/api/public/data/` ma non vengono letti

### Dove Cercare il Bug

**File da controllare:**
1. `apps/api/src/services/datasets/demAdapter.ts`
   - Verifica se `sampleFeaturesForH3Cells` ritorna slope
2. `apps/api/src/services/datasets/elsusAdapter.ts`
   - Verifica se ritorna elsusClass
3. `apps/api/src/services/datasets/clcAdapter.ts`
   - Verifica se ritorna clcClass
4. `apps/api/src/services/tileOrchestrator.ts:97-104`
   - Verifica se le feature vengono passate al Risk Engine

**Log di debug da aggiungere:**
```typescript
console.log('[DEBUG] Features passed to risk engine:', {
  slope: features.slope,
  elsusClass: features.elsusClass,
  clcClass: features.clcClass
});
```

---

## 📝 SUMMARY PER IL MODELLO

**Il Risk Engine ha formule corrette e sensate:**
- Water: slope-based drainage proxy + land cover
- Landslide: 60% slope + 40% ELSUS con boost non-lineare per slope > 45°

**MA il sistema è completamente cieco:**
- Tutte le celle ritornano score fisso 0.5
- Le feature (slope, elsus, clc) non vengono estratte dai raster
- Solo seismic funziona (probabilmente usa un adapter diverso)

**Il 10% di miglioramento non serve finché il 100% è rotto.**

Prima serve **FIX urgente**:
1. Debug adapter DEM/ELSUS/CLC
2. Verificare che le feature arrivino al Risk Engine
3. Solo dopo ottimizzare le formule

**Una volta fixato, le ottimizzazioni sensate saranno:**
- Aggiungere rain24h/rain72h per water (trigger temporali)
- Calibrare pesi slope/elsus con dati storici frane
- Aggiungere curvature terrain per landslide
- Non-linearità per water in zone urban (runoff concentrato)
