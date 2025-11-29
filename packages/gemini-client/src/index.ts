import { GoogleGenerativeAI } from "@google/generative-ai";

export interface GeoVisionSummary {
    description: string;
    features: string[];
}

export interface RiskContext {
    slopeMean: number;
    landslideHistory: string; // e.g., "HIGH", "LOW"
}

export interface RiskAnalysisResult {
    visualConfirmation: boolean;
    confidence: number;
    reasoning: string;
}

// Initialize Gemini (API Key must be passed from the caller)
const getModel = (apiKey: string) => {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Using the requested Gemini 3.0 Pro Preview model
    return genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });
};

export const analyzeSatellitePatch = async (image: any, context: any): Promise<GeoVisionSummary> => {
    return { description: "Mock analysis", features: ["water", "forest"] };
};

export const analyzeRiskWithContext = async (
    h3Index: string,
    imageBuffer: Buffer | string | null,
    context: RiskContext,
    apiKey: string
): Promise<RiskAnalysisResult> => {
    if (!apiKey) {
        console.warn("No API Key provided, returning mock response.");
        return {
            visualConfirmation: context.landslideHistory === 'HIGH',
            confidence: 0.85,
            reasoning: "MOCK RESPONSE: API Key missing. Visual scarring observed consistent with high slope and historical data."
        };
    }

    try {
        const model = getModel(apiKey);

        const promptParts: any[] = [
            `
            Role: Expert Geologist & Geomorphologist
            Task: Analyze the environmental risk for H3 cell ${h3Index}.
            
            Context Data:
            - Slope Mean: ${context.slopeMean} degrees
            - Landslide History: ${context.landslideHistory}
            
            Question:
            Based on this context ${imageBuffer ? "and the provided satellite imagery" : ""}, assess the likelihood of landslide risk. 
            ${imageBuffer ? "Look for visual evidence such as scarring, vegetation loss, or steep terrain features." : ""}
            
            Return a JSON object with:
            - visualConfirmation: boolean (true if risk is high and visually supported)
            - confidence: number (0-1)
            - reasoning: string (concise explanation)

            IMPORTANT: Return ONLY the JSON object. Do not include markdown formatting or explanation text outside the JSON.
            `
        ];

        if (imageBuffer) {
            const imageBase64 = Buffer.isBuffer(imageBuffer)
                ? imageBuffer.toString('base64')
                : imageBuffer;

            promptParts.push({
                inlineData: {
                    data: imageBase64,
                    mimeType: "image/jpeg"
                }
            });
        }

        const result = await model.generateContent(promptParts);
        const response = await result.response;
        const text = response.text();

        // Attempt to find JSON object in the response
        let jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        return JSON.parse(jsonStr) as RiskAnalysisResult;

    } catch (error) {
        console.error("Gemini API Error:", error);
        return {
            visualConfirmation: false,
            confidence: 0,
            reasoning: "Error calling Gemini API. Check server logs."
        };
    }
};

export const chatWithMap = async (
    history: { role: 'user' | 'model'; parts: string }[],
    message: string,
    context: string,
    apiKey: string
): Promise<string> => {
    if (!apiKey) return "Error: API Key missing.";

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Using the requested Gemini 3.0 Pro Preview model
        const model = genAI.getGenerativeModel({ model: "gemini-3-pro-preview" });

        const chat = model.startChat({
            history: [
                {
                    role: "user",
                    parts: [{
                        text: `You are GeoLens Assistant, a geospatial AI expert. 
                    Current Map Context: ${context}
                    
                    Answer the user's questions based on this context. Be concise and scientific.` }]
                },
                {
                    role: "model",
                    parts: [{ text: "Understood. I am ready to assist with geospatial analysis based on the provided context." }]
                },
                ...history.map(h => ({
                    role: h.role,
                    parts: [{ text: h.parts }]
                }))
            ]
        });

        const result = await chat.sendMessage(message);
        return result.response.text();
    } catch (error) {
        console.error("Gemini Chat Error:", error);
        return "I encountered an error processing your request.";
    }
};
