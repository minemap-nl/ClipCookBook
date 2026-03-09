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

// Language helper
const LANG = (process.env.LANGUAGE || 'en').toLowerCase();
const isNL = LANG === 'nl';

const UNITS_NL = ['gram', 'g', 'ml', 'cl', 'l', 'liter', 'el', 'tl', 'eetlepel', 'theelepel', 'snuf', 'snufje', 'stuks', 'teen', 'tenen', 'kopje', 'zakje', 'blikje', 'druppel', 'eetlepels', 'theelepels', 'teentje'];
const UNITS_EN = ['gram', 'g', 'mg', 'kg', 'ml', 'cl', 'l', 'liter', 'tbsp', 'tsp', 'tablespoon', 'teaspoon', 'cup', 'cups', 'oz', 'ounce', 'ounces', 'lb', 'pound', 'pounds', 'pinch', 'piece', 'pieces', 'clove', 'cloves', 'can', 'drop', 'tablespoons', 'teaspoons', 'slice', 'slices'];
const UNITS = isNL ? UNITS_NL : UNITS_EN;

// Remove all emojis from a string
function stripEmoji(text: string): string {
    return text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, '').trim();
}

// Check if a line is a portion mention
function isPortionLine(line: string): boolean {
    const clean = line.replace(/^[-*•+]\s*/, '').trim();
    if (isNL) {
        return /\d+([/\-]\d+)?\s+pers/i.test(clean) && clean.length < 40;
    }
    return /\d+([/\-]\d+)?\s+(serv|pers|portion)/i.test(clean) && clean.length < 40;
}

// Extract the number of portions from the entire text
function extractPortions(text: string): number | null {
    if (isNL) {
        const match = text.match(/(?:voor\s+)?(\d+)(?:[/\-]\d+)?\s+pers/i);
        return match ? parseInt(match[1]) : null;
    }
    const match = text.match(/(?:serves?\s+|for\s+)?(\d+)(?:[/\-]\d+)?\s+(?:serv|pers|portion)/i);
    return match ? parseInt(match[1]) : null;
}

// Section header keywords
const STEP_KEYWORDS_NL = ['bereiding', 'stappen', 'instructies', 'maakwijze', 'zo maak je het'];
const STEP_KEYWORDS_EN = ['preparation', 'steps', 'instructions', 'directions', 'method', 'how to make'];
const STEP_KEYWORDS = isNL ? STEP_KEYWORDS_NL : STEP_KEYWORDS_EN;

const INGREDIENT_REGEX_NL = /^(benodigdheden|ingrediënten|ingredienten|wat heb je nodig):?\s*/i;
const INGREDIENT_REGEX_EN = /^(ingredients|what you need|you will need|shopping list):?\s*/i;
const INGREDIENT_REGEX = isNL ? INGREDIENT_REGEX_NL : INGREDIENT_REGEX_EN;

export function extractRecipeData(text: string): ExtractedData {
    const portions = extractPortions(text);
    const result: ExtractedData = { title: undefined, description: undefined, tags: [], ingredients: [], steps: [], portions };

    // Strip emojis and filter empty lines
    const lines = text.split('\n')
        .map(l => stripEmoji(l).trim())
        .filter(l => l.length > 0);

    let isStepSection = false;
    let isIngredientSection = false;

    for (let line of lines) {
        const originalLine = line;
        const lowerLine = line.toLowerCase();

        // Skip portion lines in ingredient list
        if (isPortionLine(line)) continue;

        // Skip hashtag lines and URLs
        if (line.startsWith('#') || line.startsWith('http')) continue;

        if (STEP_KEYWORDS.some(kw => lowerLine.includes(kw))) {
            isStepSection = true;
            isIngredientSection = false;
            continue;
        }

        if (INGREDIENT_REGEX.test(line)) {
            isIngredientSection = true;
            isStepSection = false;
            line = line.replace(INGREDIENT_REGEX, '');
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
                const checkWord = isNL ? 'ingrediënt' : 'ingredient';
                if (originalLine.length > 5 && !originalLine.toLowerCase().startsWith(checkWord)) {
                    const noBullet = originalLine.replace(/^[-*•+\d+\.]\s+/, '').trim();
                    if (noBullet) {
                        result.steps.push(noBullet);
                    }
                }
            }
        }
    }

    // Fallback: text without recognizable structure → everything as steps
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

    const stripPrefix = isNL ? /^(van|x)\s+/i : /^(of|x)\s+/i;
    name = name.replace(/^[\s,.:]+|[\s,.:]+$/g, '').replace(stripPrefix, '').trim();
    return { name, amount, unit };
}

// --- AI Schema descriptions ---
function getSchemaDescriptions() {
    if (isNL) {
        return {
            isRecipeText: "True als de tekst daadwerkelijk een recept of kookinstructies bevat. False als het iets compleet anders is.",
            isRecipeVideo: "True als de video daadwerkelijk koken, een gerecht of een recept bevat. False als het iets compleet anders is.",
            isRecipeImage: "True als de afbeelding(en) daadwerkelijk een recept of voedsel bevatten. False als het iets compleet anders is.",
            title: "Een duidelijke, smakelijke titel voor het gerecht",
            description: "Een heel korte, uitnodigende beschrijving van het recept als introductietekst",
            tags: "Lijst van maximaal 4 korte categorie tags (bijv. 'Diner', 'Snel', 'Vegetarisch', 'Kip')",
            portions: "Aantal personen. Leid af uit tekst/ingrediënten of de beschrijving. Vul ALTIJD in. Standaardwaarde is 4 als onbekend.",
            portionsVideo: "Aantal personen. Leid af uit de tekst, ingrediënten of video. Standaard is 4 als onbekend.",
            portionsImage: "Aantal personen. Leid af uit de tekst of beelden."
        };
    }
    return {
        isRecipeText: "True if the text actually contains a recipe or cooking instructions. False if it's something completely different.",
        isRecipeVideo: "True if the video actually contains cooking, a dish, or a recipe. False if it's something completely different.",
        isRecipeImage: "True if the image(s) actually contain a recipe or food. False if it's something completely different.",
        title: "A clear, appetizing title for the dish",
        description: "A very short, inviting description of the recipe as introductory text",
        tags: "List of up to 4 short category tags (e.g. 'Dinner', 'Quick', 'Vegetarian', 'Chicken')",
        portions: "Number of servings. Infer from text/ingredients or description. ALWAYS fill in. Default is 4 if unknown.",
        portionsVideo: "Number of servings. Infer from text, ingredients, or video. Default is 4 if unknown.",
        portionsImage: "Number of servings. Infer from text or images."
    };
}

function buildResponseSchema(isRecipeDesc: string, portionsDesc: string): Schema {
    const desc = getSchemaDescriptions();
    return {
        type: Type.OBJECT,
        properties: {
            isRecipe: { type: Type.BOOLEAN, description: isRecipeDesc },
            title: { type: Type.STRING, nullable: true, description: desc.title },
            description: { type: Type.STRING, nullable: true, description: desc.description },
            tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: desc.tags,
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
            portions: { type: Type.NUMBER, description: portionsDesc }
        },
        required: ["isRecipe", "title", "description", "tags", "ingredients", "steps", "portions"]
    };
}

// --- AI Prompts ---
function getTextPrompt(text: string): string {
    if (isNL) {
        return `Je krijgt een beschrijving of tekst van een website/video met (hopelijk) een recept erin.
Haal hieruit het recept en structureer dit in een titel, korte beschrijving, tags, ingrediënten, stappen en het aantal porties.
Regels:
0. Bepaal allereerst of de tekst ECHT een recept is. Als het enkel een persoonlijk verhaal of babbeltje is over eten/ingrediënten (bijv. "Je moet de beste olijfolie gebruiken..." zonder echte bereidingswijze), zet dan 'isRecipe' resoluut op false!
1. Wees zo beknopt en efficiënt mogelijk om tokens te besparen! Verzin zelf niks bij de stappen of ingrediënten, neem ze over van de beschrijving.
2. Genereer een duidelijke, smakelijke Nederlandse 'title' voor het gerecht (bijv. "Romige Pasta Pesto").
3. Genereer een heel korte, uitnodigende Nederlandse 'description' (max 2 zinnen) gebaseerd op de tekst.
4. Bedenk maximaal 4 logische 'tags' in het Nederlands (bijv. ["Diner", "Snel", "Pasta"]).
5. Als de tekst geen duidelijke ingrediënten of stappen heeft (enkel verhaal of linkjes), stop dan de hele nuttige tekst (zonder hashtags/links) als één grote string in het 'steps' array. Vraag je wel sterk af of dit daadwerkelijk een recept is (zie regel 0).
6. Als een van de twee ontbreekt (alleen ingrediënten, of alleen stappen), vul dan in wat er wél is.
7. Schrijf afkortingen van eenheden altijd volledig uit in het Nederlands. Bijvoorbeeld: 'g' wordt 'gram', 'ml' wordt 'milliliter', 'el' wordt 'eetlepel', 'tl' wordt 'theelepel', etc.
8. Laat overbodige eenheden weg indien het duidelijker is. Bijvoorbeeld: '1 stuk ei' wordt gewoon amount: 1 en name: 'ei' (unit is dan null of leeg).
9. Als de tekst geen losse boodschappenlijst heeft, maar er staan wel ingrediënten met de benodigde hoeveelheden expliciet in de tekst of bereidingswijze, extraheer deze dan zelf apart naar het 'ingredients' array en haal ze desgewenst uit de stappen tekst weg of laat ze staan, zolang ze maar netjes in 'ingredients' staan!
Beschrijving:
${text}`;
    }
    return `You are given a description or text from a website/video that (hopefully) contains a recipe.
Extract the recipe and structure it into a title, short description, tags, ingredients, steps, and the number of portions.
Rules:
0. First determine if the text is ACTUALLY a recipe. If it is just a personal story or a chat about food/ingredients (e.g. "You need to buy the best quality extra virgin olive oil..." without real preparation steps), set 'isRecipe' to explicitly false!
1. Be as concise and efficient as possible to save tokens! Do not invent any steps or ingredients yourself, take them from the description.
2. Generate a clear, appetizing English 'title' for the dish (e.g. "Creamy Pesto Pasta").
3. Generate a very short, inviting English 'description' (max 2 sentences) based on the text.
4. Come up with up to 4 logical 'tags' in English (e.g. ["Dinner", "Quick", "Pasta"]).
5. If the text has no clear ingredients or steps (just a story or links), put the entire useful text (without hashtags/links) as one large string in the 'steps' array. But strongly consider if this is truly a recipe (see rule 0).
6. If one of the two is missing (only ingredients, or only steps), fill in what is available.
7. Always write unit abbreviations out in full in English. For example: 'g' becomes 'gram', 'ml' becomes 'milliliter', 'tbsp' becomes 'tablespoon', 'tsp' becomes 'teaspoon', etc.
8. Leave out unnecessary units when it's clearer. For example: '1 piece egg' becomes simply amount: 1 and name: 'egg' (unit is then null or empty).
9. If the text does not have a separate shopping list but ingredients with required amounts are explicitly mentioned in the text or preparation method, extract them separately into the 'ingredients' array.
Description:
${text}`;
}

function getVideoPrompt(fallbackText: string): string {
    if (isNL) {
        return `Kijk aandachtig naar de bijgevoegde video. Luister naar de gesproken stem, en lees de eventuele tekst in de video. 
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
    }
    return `Watch the attached video carefully. Listen to the spoken voice, and read any text shown in the video.
Give me the full recipe in English with ingredients and steps. Ignore the people on screen and focus on the cooking and the food.
Combine and supplement your findings from the video with the following original description (if it contains relevant text):

Original text:
${fallbackText}

Rules:
0. First determine whether this video/text is about food or a recipe. If so, set 'isRecipe' to true. If it contains a completely different subject (e.g. news, cars, random vlog), set isRecipe to false.
1. Be as concise and efficient as possible.
2. Generate an appetizing title.
3. Short inviting description.
4. Up to 4 tags.
5. Write unit abbreviations out in full in English (g -> gram, etc).
6. Leave out unnecessary units (1 piece egg -> 1 egg).`;
}

function getImagePrompt(fallbackText: string): string {
    if (isNL) {
        return `Kijk aandachtig naar de bijgevoegde foto('s). Dit is (zijn) een foto('s) van een ingrediëntenlijst, een recept uit een boek, een screenshot, of beelden van een gerecht.
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
    }
    return `Look carefully at the attached photo(s). This is (these are) photo(s) of an ingredient list, a recipe from a book, a screenshot, or images of a dish.
Give me the full recipe in English with ingredients and steps. If there are steps or ingredients shown in the text in the image, take them over exactly or structure them neatly.

Combine and supplement your findings from the images with the following original text if present:
Original text:
${fallbackText}

Rules:
0. FIRST determine whether these photos actually show a recipe or food. If not, fill in isRecipe: false.
1. Be as concise and efficient as possible.
2. Generate an appetizing title.
3. Short inviting description.
4. Up to 4 tags.
5. Write unit abbreviations out in full in English (g -> gram, etc).
6. Leave out unnecessary units (1 piece egg -> 1 egg).`;
}

// --- Error messages ---
const ERR = {
    noApiKey: isNL ? "Geen Gemini API key gevonden in .env file." : "No Gemini API key found in .env file.",
    notRecipeText: isNL ? "Gefilterd: Tekst was geen recept." : "Filtered: Text was not a recipe.",
    videoFailed: "Video processing failed by Google AI.",
    notRecipeVideo: isNL
        ? "Geen recept of kookgerelateerde content gevonden in deze video. Let op: controleer of je de juiste link gebruikt."
        : "No recipe or cooking-related content found in this video. Note: check that you are using the correct link.",
    notRecipeImage: isNL
        ? "De AI kon geen recept of voedsel herkennen in de geüploade media. Probeer het met specifiekere kookfoto's."
        : "The AI could not recognize a recipe or food in the uploaded media. Try with more specific cooking photos."
};

export async function extractRecipeDataAI(text: string): Promise<ExtractedData> {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error(ERR.noApiKey);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const desc = getSchemaDescriptions();
    const responseSchema = buildResponseSchema(desc.isRecipeText, desc.portions);
    const prompt = getTextPrompt(text);

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
            throw new Error(ERR.notRecipeText);
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
        const filterWord = isNL ? "gefilterd" : "filtered";
        if (e.message && e.message.toLowerCase().includes(filterWord)) {
            throw e;
        }
        console.error("AI parse error", e);
        return { ingredients: [], steps: [text], portions: null };
    }
}

export async function extractRecipeDataFromVideo(videoPath: string, fallbackText: string): Promise<ExtractedData> {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error(ERR.noApiKey);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    let uploadedFile: any = null;
    const desc = getSchemaDescriptions();
    const responseSchema = buildResponseSchema(desc.isRecipeVideo, desc.portionsVideo);

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
            throw new Error(ERR.videoFailed);
        }

        console.log("Video processing complete. Status:", fileState);

        // 3. Generate content
        const prompt = getVideoPrompt(fallbackText);

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
            throw new Error(ERR.notRecipeVideo);
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
        const recipeWord = isNL ? "geen recept" : "no recipe";
        if (e.message && e.message.toLowerCase().includes(recipeWord)) {
            throw e;
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
        throw new Error(ERR.noApiKey);
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const uploadedFiles: any[] = [];
    const desc = getSchemaDescriptions();
    const responseSchema = buildResponseSchema(desc.isRecipeImage, desc.portionsImage);

    try {
        // 1. Upload all images
        for (const imagePath of imagePaths) {
            console.log("Uploading image to Gemini:", imagePath);
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
            }
        }

        // 3. Generate content
        const prompt = getImagePrompt(fallbackText);
        const contents: any[] = [prompt];

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
            throw new Error(ERR.notRecipeImage);
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
        const recipeWord = isNL ? "geen recept of voedsel" : "could not recognize a recipe";
        if (e.message && e.message.toLowerCase().includes(recipeWord)) {
            throw e;
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
