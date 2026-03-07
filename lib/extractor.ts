import { GoogleGenAI, Type, Schema } from '@google/genai';

export interface Ingredient {
    name: string;
    amount: number | null;
    unit: string | null;
}

export interface ExtractedData {
    isRecipe?: boolean;
    title?: string;
    description?: string;
    tags?: string[];
    ingredients: Ingredient[];
    steps: string[];
    portions: number | null;
}

const UNITS = ['gram', 'g', 'ml', 'cl', 'l', 'liter', 'el', 'tl', 'eetlepel', 'theelepel', 'snuf', 'snufje', 'stuks', 'teen', 'tenen', 'kopje', 'zakje', 'blikje', 'druppel', 'eetlepels', 'theelepels', 'teentje'];

// Verwijder alle emoji's uit een string
function stripEmoji(text: string): string {
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
}

// Check of een regel een portiemelding is
// Matcht: "voor 4 personen", "3/4 personen", "- 3/4 personen", "Ingrediënten - 3/4 personen"
function isPortionLine(line: string): boolean {
    const clean = line.replace(/^[-*•+]\s*/, '').trim();
    return /\d+([/\-]\d+)?\s+pers/i.test(clean) && clean.length < 40;
}

// Haal het aantal porties uit de hele tekst
function extractPortions(text: string): number | null {
    // Zoek patronen als "voor 4 personen", "3/4 personen", "- 4 personen"
    const match = text.match(/(?:voor\s+)?(\d+)(?:[/\-]\d+)?\s+pers/i);
    return match ? parseInt(match[1]) : null;
}

export function extractRecipeData(text: string): ExtractedData {
    const portions = extractPortions(text);
    const result: ExtractedData = { title: undefined, description: undefined, tags: [], ingredients: [], steps: [], portions };

    // Strip emoji's en filter lege regels
    const lines = text.split('\n')
        .map(l => stripEmoji(l).trim())
        .filter(l => l.length > 0);

    let isStepSection = false;
    let isIngredientSection = false;

    for (let line of lines) {
        const originalLine = line;
        const lowerLine = line.toLowerCase();

        // Skip portieregels in ingrediëntenlijst
        if (isPortionLine(line)) continue;

        // Hashtag-regels en URL's skippen
        if (line.startsWith('#') || line.startsWith('http')) continue;

        if (lowerLine.includes('bereiding') || lowerLine.includes('stappen') || lowerLine.includes('instructies') || lowerLine.includes('maakwijze') || lowerLine.includes('zo maak je het')) {
            isStepSection = true;
            isIngredientSection = false;
            continue;
        }

        if (/^(benodigdheden|ingrediënten|ingredienten|wat heb je nodig):?\s*/i.test(line)) {
            isIngredientSection = true;
            isStepSection = false;
            line = line.replace(/^(benodigdheden|ingrediënten|ingredienten|wat heb je nodig):?\s*/i, '');
            if (!line.trim()) continue;
        }

        const startsWithBullet = /^[-*•+]\s+/.test(line);
        const startsWithNumber = /^\d+/.test(line);
        const hasUnit = UNITS.some(u => new RegExp(`\\b${u}\\b`, 'i').test(line));

        let isLikelyIngredient = false;
        if (isIngredientSection) {
            isLikelyIngredient = true;
        } else if (!isStepSection) {
            if ((startsWithBullet || startsWithNumber) && (hasUnit || line.length < 60)) {
                isLikelyIngredient = true;
            } else if (hasUnit && line.length < 50) {
                isLikelyIngredient = true;
            }
        }

        if (isLikelyIngredient && !isStepSection) {
            const parts = line.includes(',') && line.length < 80 ? line.split(/,\s+/) : [line];
            for (let part of parts) {
                part = part.replace(/^[-*•+]\s+/, '').trim();
                if (part.length < 2) continue;
                if (isPortionLine(part)) continue;
                const parsed = parseIngredient(part);
                result.ingredients.push(parsed);
            }
        } else {
            if (isStepSection || result.ingredients.length > 0) {
                if (originalLine.length > 5 && !originalLine.toLowerCase().startsWith('ingrediënt')) {
                    const noBullet = originalLine.replace(/^[-*•+\d+\.]\s+/, '').trim();
                    if (noBullet) {
                        result.steps.push(noBullet);
                    }
                }
            }
        }
    }

    // Fallback: tekst zonder herkenbare structuur → alles als stappen
    if (result.ingredients.length === 0 && result.steps.length === 0) {
        result.steps = lines.filter(l => l.length > 5 && !l.startsWith('#') && !l.startsWith('http')).map(l => l.trim());
    }

    return result;
}

function parseIngredient(text: string): Ingredient {
    let amount: number | null = null;
    let unit: string | null = null;
    let name = text;

    const match = name.match(/([\d.,]+)/);
    if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(val)) amount = val;
        name = name.replace(match[0], '').trim();
    }

    for (const u of UNITS) {
        const uRegex = new RegExp(`^${u}\\b`, 'i');
        if (uRegex.test(name)) {
            unit = u.toLowerCase();
            name = name.replace(uRegex, '').trim();
            break;
        }
    }

    if (!unit) {
        for (const u of UNITS) {
            const anyRegex = new RegExp(`\\b${u}\\b`, 'i');
            if (anyRegex.test(name)) {
                unit = u.toLowerCase();
                name = name.replace(anyRegex, '').trim();
                break;
            }
        }
    }

    name = name.replace(/^[\s,.:]+|[\s,.:]+$/g, '').replace(/^(van|x)\s+/i, '').trim();
    return { name, amount, unit };
}

export async function extractRecipeDataAI(text: string): Promise<ExtractedData> {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Geen Gemini API key gevonden in .env file.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            isRecipe: { type: Type.BOOLEAN, description: "True als de tekst daadwerkelijk een recept of kookinstructies bevat. False als het iets compleet anders is." },
            title: { type: Type.STRING, nullable: true, description: "Een duidelijke, smakelijke titel voor het gerecht" },
            description: { type: Type.STRING, nullable: true, description: "Een heel korte, uitnodigende beschrijving van het recept als introductietekst" },
            tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Lijst van maximaal 4 korte categorie tags (bijv. 'Diner', 'Snel', 'Vegetarisch', 'Kip')",
                nullable: true
            },
            ingredients: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        amount: { type: Type.NUMBER, nullable: true },
                        unit: { type: Type.STRING, nullable: true }
                    },
                    required: ["name"]
                }
            },
            steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            portions: { type: Type.NUMBER, description: "Aantal personen. Leid af uit tekst/ingrediënten of de beschrijving. Vul ALTIJD in. Standaardwaarde is 4 als onbekend." }
        },
        required: ["isRecipe", "title", "description", "tags", "ingredients", "steps", "portions"]
    };

    const prompt = `Je krijgt een beschrijving of tekst van een website/video met (hopelijk) een recept erin.
Haal hieruit het recept en structureer dit in een titel, korte beschrijving, tags, ingrediënten, stappen en het aantal porties.
Regels:
1. Wees zo beknopt en efficiënt mogelijk om tokens te besparen! Verzin zelf niks bij de stappen of ingrediënten, neem ze over van de beschrijving.
2. Genereer een duidelijke, smakelijke Nederlandse 'title' voor het gerecht (bijv. "Romige Pasta Pesto").
3. Genereer een heel korte, uitnodigende Nederlandse 'description' (max 2 zinnen) gebaseerd op de tekst.
4. Bedenk maximaal 4 logische 'tags' in het Nederlands (bijv. ["Diner", "Snel", "Pasta"]).
5. Als de tekst geen duidelijke ingrediënten of stappen heeft (enkel verhaal of linkjes), stop dan de hele nuttige tekst (zonder hashtags/links) als één grote string in het 'steps' array.
6. Als een van de twee ontbreekt (alleen ingrediënten, of alleen stappen), vul dan in wat er wél is.
7. Schrijf afkortingen van eenheden altijd volledig uit in het Nederlands. Bijvoorbeeld: 'g' wordt 'gram', 'ml' wordt 'milliliter', 'el' wordt 'eetlepel', 'tl' wordt 'theelepel', etc.
8. Laat overbodige eenheden weg indien het duidelijker is. Bijvoorbeeld: '1 stuk ei' wordt gewoon amount: 1 en name: 'ei' (unit is dan null of leeg).
9. Als de tekst geen losse boodschappenlijst heeft, maar er staan wel ingrediënten met de benodigde hoeveelheden expliciet in de tekst of bereidingswijze, extraheer deze dan zelf apart naar het 'ingredients' array en haal ze desgewenst uit de stappen tekst weg of laat ze staan, zolang ze maar netjes in 'ingredients' staan!
Beschrijving:
${text}`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
            temperature: 0.1,
        }
    });

    try {
        const jsonStr = response.text;
        const parsed = JSON.parse(jsonStr || '{}');

        if (parsed.isRecipe === false) {
            throw new Error("Gefilterd: Tekst was geen recept.");
        }

        const title = parsed.title;
        const description = parsed.description;
        const tags = parsed.tags || [];
        const ingredients = parsed.ingredients || [];
        let steps = parsed.steps || [];
        const portions = parsed.portions || null;

        if (ingredients.length === 0 && steps.length === 0) {
            steps = [text];
        }

        return { isRecipe: parsed.isRecipe, title, description, tags, ingredients, steps, portions };
    } catch (e: any) {
        if (e.message && e.message.toLowerCase().includes("gefilterd")) {
            throw e; // Pass to the caller function so it stops saving
        }
        console.error("AI parse error", e);
        return { ingredients: [], steps: [text], portions: null };
    }
}

export async function extractRecipeDataFromVideo(videoPath: string, fallbackText: string): Promise<ExtractedData> {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Geen Gemini API key gevonden in .env file.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let uploadedFile: any = null;

    const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            isRecipe: { type: Type.BOOLEAN, description: "True als de video daadwerkelijk koken, een gerecht of een recept bevat. False als het iets compleet anders is." },
            title: { type: Type.STRING, nullable: true, description: "Een duidelijke, smakelijke titel voor het gerecht" },
            description: { type: Type.STRING, nullable: true, description: "Een heel korte, uitnodigende beschrijving van het recept als introductietekst" },
            tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Lijst van maximaal 4 korte categorie tags (bijv. 'Diner', 'Snel', 'Vegetarisch', 'Kip')",
                nullable: true
            },
            ingredients: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        amount: { type: Type.NUMBER, nullable: true },
                        unit: { type: Type.STRING, nullable: true }
                    },
                    required: ["name"]
                }
            },
            steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            portions: { type: Type.NUMBER, description: "Aantal personen. Leid af uit de tekst, ingrediënten of video. Standaard is 4 als onbekend." }
        },
        required: ["isRecipe", "title", "description", "tags", "ingredients", "steps", "portions"]
    };

    try {
        // 1. Upload video
        console.log("Uploading video to Gemini:", videoPath);
        uploadedFile = await ai.files.upload({
            file: videoPath,
            config: {
                mimeType: 'video/mp4',
            }
        });

        // 2. Poll status until ACTIVE
        let fileState = uploadedFile.state;
        while (fileState === 'PROCESSING') {
            await new Promise(r => setTimeout(r, 2000));
            uploadedFile = await ai.files.get({ name: uploadedFile.name });
            fileState = uploadedFile.state;
        }

        if (fileState === 'FAILED') {
            throw new Error("Video processing failed by Google AI.");
        }

        console.log("Video processing complete. Status:", fileState);

        // 3. Generate content
        const prompt = `Kijk aandachtig naar de bijgevoegde video. Luister naar de gesproken stem, en lees de eventuele tekst in de video. 
Geef me het volledige recept in het Nederlands met ingrediënten en stappen. Negeer de personen die in beeld zijn en focus op het koken en het eten.
Combineer en vul je bevindingen uit de video aan met de volgende originele beschrijving (als die relevant tekst bevat):

Originele tekst:
${fallbackText}

Regels:
0. Bepaal eerst of deze video/tekst over eten of een recept gaat. Zet in dat geval 'isRecipe' op true. Indien het een totaal ander onderwerp bevat (bijvoorbeeld nieuws, auto's, random vlog), zet isRecipe op false.
1. Wees zo beknopt en efficiënt mogelijk.
2. Genereer een smakelijke titel.
3. Korte uitnodigende beschrijving.
4. Maximaal 4 tags.
5. Volledige Nederlandse uitschrijving van afkortingen (g -> gram, etc).
6. Laat overbodige eenheden weg (1 stuk ei -> 1 ei).`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                prompt,
                {
                    fileData: {
                        fileUri: uploadedFile.uri,
                        mimeType: uploadedFile.mimeType,
                    }
                }
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.1,
            }
        });

        const jsonStr = response.text;
        const parsed = JSON.parse(jsonStr || '{}');

        if (parsed.isRecipe === false) {
            throw new Error("Geen recept of kookgerelateerde content gevonden in deze video. Let op: controleer of je de juiste link gebruikt.");
        }

        return {
            isRecipe: parsed.isRecipe,
            title: parsed.title,
            description: parsed.description,
            tags: parsed.tags || [],
            ingredients: parsed.ingredients || [],
            steps: parsed.steps || [],
            portions: parsed.portions || null
        };
    } catch (e: any) {
        if (e.message && e.message.toLowerCase().includes("geen recept")) {
            throw e; // Throw upwards so the job displays the error
        }
        console.error("Video AI parse error", e);
        return { ingredients: [], steps: [fallbackText], portions: null };
    } finally {
        // 4. Always delete the file to save cloud storage space
        if (uploadedFile && uploadedFile.name) {
            try {
                await ai.files.delete({ name: uploadedFile.name });
                console.log("Deleted video from Gemini:", uploadedFile.name);
            } catch (err) {
                console.error("Failed to delete video from Gemini:", err);
            }
        }
    }
}

export async function extractRecipeDataFromImages(imagePaths: string[], fallbackText: string): Promise<ExtractedData> {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("Geen Gemini API key gevonden in .env file.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const uploadedFiles: any[] = [];

    const responseSchema: Schema = {
        type: Type.OBJECT,
        properties: {
            isRecipe: { type: Type.BOOLEAN, description: "True als de afbeelding(en) daadwerkelijk een recept of voedsel bevatten. False als het iets compleet anders is." },
            title: { type: Type.STRING, nullable: true, description: "Een duidelijke, smakelijke titel voor het gerecht" },
            description: { type: Type.STRING, nullable: true, description: "Een heel korte, uitnodigende beschrijving van het recept als introductietekst" },
            tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Lijst van maximaal 4 korte categorie tags (bijv. 'Diner', 'Snel', 'Vegetarisch', 'Kip')",
                nullable: true
            },
            ingredients: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        name: { type: Type.STRING },
                        amount: { type: Type.NUMBER, nullable: true },
                        unit: { type: Type.STRING, nullable: true }
                    },
                    required: ["name"]
                }
            },
            steps: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            },
            portions: { type: Type.NUMBER, description: "Aantal personen. Leid af uit de tekst of beelden." }
        },
        required: ["isRecipe", "title", "description", "tags", "ingredients", "steps", "portions"]
    };

    try {
        // 1. Upload all images
        for (const imagePath of imagePaths) {
            console.log("Uploading image to Gemini:", imagePath);
            // Deduce mime type from extension
            let mimeType = 'image/jpeg';
            if (imagePath.toLowerCase().endsWith('.png')) mimeType = 'image/png';
            if (imagePath.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
            if (imagePath.toLowerCase().endsWith('.heic')) mimeType = 'image/heic';

            const uploadedFile = await ai.files.upload({
                file: imagePath,
                config: { mimeType }
            });
            uploadedFiles.push(uploadedFile);
        }

        // 2. Poll status until all are ACTIVE
        for (let i = 0; i < uploadedFiles.length; i++) {
            let fileState = uploadedFiles[i].state;
            while (fileState === 'PROCESSING') {
                await new Promise(r => setTimeout(r, 2000));
                uploadedFiles[i] = await ai.files.get({ name: uploadedFiles[i].name });
                fileState = uploadedFiles[i].state;
            }
            if (fileState === 'FAILED') {
                console.error("Image processing failed for:", uploadedFiles[i].name);
                // We don't throw, we'll try to process whatever succeeded
            }
        }

        // 3. Generate content
        const prompt = `Kijk aandachtig naar de bijgevoegde foto('s). Dit is (zijn) een foto('s) van een ingrediëntenlijst, een recept uit een boek, een screenshot, of beelden van een gerecht.
Geef me het volledige recept in het Nederlands met ingrediënten en stappen. Als er in de afgebeelde tekst stappen of ingrediënten staan, neem die dan exact over of structureer ze netjes.

Combineer en vul je bevindingen uit de afbeeldingen aan met de eventuele volgende originele tekst:
Originele tekst:
${fallbackText}

Regels:
0. Bepaal EERST of er in deze foto's wel echt een recept of eten wordt getoond. Zo niet, vul isRecipe: false in.
1. Wees zo beknopt en efficiënt mogelijk.
2. Genereer een smakelijke titel.
3. Korte uitnodigende beschrijving.
4. Maximaal 4 tags.
5. Volledige Nederlandse uitschrijving van afkortingen (g -> gram, etc).
6. Laat overbodige eenheden weg (1 stuk ei -> 1 ei).`;

        const contents: any[] = [prompt];

        // Add valid files to contents
        for (const file of uploadedFiles) {
            if (file.state === 'ACTIVE') {
                contents.push({
                    fileData: {
                        fileUri: file.uri,
                        mimeType: file.mimeType,
                    }
                });
            }
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: {
                responseMimeType: 'application/json',
                responseSchema: responseSchema,
                temperature: 0.1,
            }
        });

        const jsonStr = response.text;
        const parsed = JSON.parse(jsonStr || '{}');

        if (parsed.isRecipe === false) {
            throw new Error("De AI kon geen recept of voedsel herkennen in de geüploade media. Probeer het met specifiekere kookfoto's.");
        }

        return {
            isRecipe: parsed.isRecipe,
            title: parsed.title,
            description: parsed.description,
            tags: parsed.tags || [],
            ingredients: parsed.ingredients || [],
            steps: parsed.steps || [],
            portions: parsed.portions || null
        };
    } catch (e: any) {
        if (e.message && e.message.toLowerCase().includes("geen recept of voedsel")) {
            throw e; // Throw upwards
        }
        console.error("Image AI parse error", e);
        return { ingredients: [], steps: [fallbackText], portions: null };
    } finally {
        // 4. Clean up all uploaded files
        for (const file of uploadedFiles) {
            if (file && file.name) {
                try {
                    await ai.files.delete({ name: file.name });
                    console.log("Deleted image from Gemini:", file.name);
                } catch (err) {
                    console.error("Failed to delete image from Gemini:", file.name, err);
                }
            }
        }
    }
}
