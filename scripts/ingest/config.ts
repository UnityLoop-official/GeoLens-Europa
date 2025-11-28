import path from 'path';

export const CONFIG = {
    // H3 Resolution (6 is approx 3.6km edge, good balance for EU scale)
    H3_RESOLUTION: 6,

    // Bounding Box for Europe (Approximate)
    // West, South, East, North
    BBOX: {
        west: -10.0,
        south: 35.0,
        east: 30.0,
        north: 70.0
    },

    // Directories
    DIRS: {
        RAW: path.resolve(__dirname, '../../data/raw'),
        INTERMEDIATE: path.resolve(__dirname, '../../data/intermediate'),
        OUTPUT: path.resolve(__dirname, '../../apps/api/public/data')
    },

    // URLs (can be overridden by env vars)
    URLS: {
        ELSUS: process.env.ELSUS_DOWNLOAD_URL || '',
        ESHM20: process.env.ESHM20_DOWNLOAD_URL || '',
        CLC: process.env.CLC_DOWNLOAD_URL || '',
        DEM_BUCKET: 'copernicus-dem-30m' // S3 Bucket name
    }
};
