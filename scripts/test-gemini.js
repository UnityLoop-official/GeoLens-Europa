const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: 'apps/api/.env' });

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        console.log("Testing gemini-1.5-flash...");
        const result = await model.generateContent("Hello");
        console.log("Success! Response:", result.response.text());
    } catch (error) {
        console.error("Error with gemini-1.5-flash:", error.message);
    }

    // Try to list models if possible (not directly supported by SDK easily without using the REST API, but let's try a known list)
    const models = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-pro", "gemini-1.0-pro"];

    for (const m of models) {
        if (m === "gemini-1.5-flash") continue; // already tested
        console.log(`Testing ${m}...`);
        try {
            const model = genAI.getGenerativeModel({ model: m });
            await model.generateContent("Hello");
            console.log(`Success with ${m}!`);
        } catch (e) {
            console.log(`Failed ${m}: ${e.message}`);
        }
    }
}

listModels();
