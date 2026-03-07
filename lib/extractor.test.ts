import { expect, test, describe } from "bun:test";
import { extractRecipeData } from "./extractor";

describe("Extract Recipe Data", () => {
    test("Extracts bullet point ingredients", () => {
        const text = `
    Heerlijke oma griesmeelpudding!
    
    Ingredienten:
    - 500 ml melk
    - 50 gram griesmeel
    - 40 gram suiker
    - 1 tl vanille-extract
    
    Bereiding:
    Breng de melk aan de kook.
    Voeg griesmeel en suiker toe.
    `;
        const result = extractRecipeData(text);
        expect(result.ingredients.length).toBe(4);
        expect(result.ingredients[0].amount).toBe(500);
        expect(result.ingredients[0].unit).toBe("ml");
        expect(result.ingredients[0].name).toBe("melk");

        expect(result.ingredients[1].amount).toBe(50);
        expect(result.ingredients[1].unit).toBe("gram");
        expect(result.ingredients[1].name).toBe("griesmeel");

        expect(result.steps.length).toBeGreaterThan(0);
        expect(result.steps[0]).toContain("Breng de melk");
    });

    test("Extracts comma separated ingredients", () => {
        const text = `
    Benodigdheden: 200 ml room, 1 snufje zout, 2 stuks eieren.
    Zo maak je het: klop alles goed door elkaar.
    `;
        const result = extractRecipeData(text);
        expect(result.ingredients.length).toBe(3);

        expect(result.ingredients[0].amount).toBe(200);
        expect(result.ingredients[0].unit).toBe("ml");
        expect(result.ingredients[0].name).toBe("room");

        expect(result.ingredients[1].amount).toBe(1);
        expect(result.ingredients[1].unit).toBe("snufje");
        expect(result.ingredients[1].name).toBe("zout");

        expect(result.ingredients[2].amount).toBe(2);
        expect(result.ingredients[2].unit).toBe("stuks");
        expect(result.ingredients[2].name).toBe("eieren");
    });

    test("Strips emoji from text", () => {
        const text = `
    Ingredienten:
    - 200 gram bloem 🍕
    Bereiding:
    Meng alles door elkaar 🎉
    `;
        const result = extractRecipeData(text);
        expect(result.ingredients[0].name).toBe("bloem");
        expect(result.steps[0]).toBe("Meng alles door elkaar");
    });

    test("Filters out portion lines from ingredients", () => {
        const text = `
    Ingrediënten - 3/4 personen
    - 200 gram bloem
    - 100 ml melk
    Bereiding:
    Meng alles door.
    `;
        const result = extractRecipeData(text);
        expect(result.ingredients.length).toBe(2);
        expect(result.portions).toBe(3);
    });

    test("Narrative text without recipe goes to steps", () => {
        const text = `
    Mini Beef Wellington Reageer 'kerst' en we sturen je het recept via DM.
    Een Mini Beef Wellington is zo'n recept waar je meteen indruk mee maakt.
    `;
        const result = extractRecipeData(text);
        expect(result.ingredients.length).toBe(0);
        expect(result.steps.length).toBeGreaterThan(0);
    });
});
