import { extractRecipeData } from "./lib/extractor";

const text = `
    Benodigdheden: 200 ml room, 1 snufje zout, 2 stuks eieren.
    Zo maak je het: klop alles door elkaar.
`;

console.log("=== FULL RUN ===");
const result = extractRecipeData(text);
console.log(JSON.stringify(result, null, 2));
console.log("=== END ===");
