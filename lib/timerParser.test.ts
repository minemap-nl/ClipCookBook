import { expect, test, describe } from "bun:test";
import { parseTimeToMs, parseTimeMatches, buildTimerRegex } from "./timerParser";

describe("parseTimeToMs", () => {
    // Basic digit-based times
    test("15 minuten → 15 min", () => {
        expect(parseTimeToMs("15 minuten")).toBe(15 * 60 * 1000);
    });

    test("2 uur → 2 hours", () => {
        expect(parseTimeToMs("2 uur")).toBe(2 * 60 * 60 * 1000);
    });

    test("30 seconden → 30 sec", () => {
        expect(parseTimeToMs("30 seconden")).toBe(30 * 1000);
    });

    test("1.5 uur → 90 min", () => {
        expect(parseTimeToMs("1.5 uur")).toBe(90 * 60 * 1000);
    });

    test("1,5 uur (Dutch decimal) → 90 min", () => {
        expect(parseTimeToMs("1,5 uur")).toBe(90 * 60 * 1000);
    });

    // Compound times
    test("1 uur en 10 minuten → 70 min", () => {
        expect(parseTimeToMs("1 uur en 10 minuten")).toBe(70 * 60 * 1000);
    });

    test("2 hours and 15 minutes → 135 min", () => {
        expect(parseTimeToMs("2 hours and 15 minutes")).toBe(135 * 60 * 1000);
    });

    test("1 uur en 30 seconden → 60.5 min", () => {
        expect(parseTimeToMs("1 uur en 30 seconden")).toBe(60 * 60 * 1000 + 30 * 1000);
    });

    // Written-out numbers (English)
    test("fifteen minutes → 15 min", () => {
        expect(parseTimeToMs("fifteen minutes")).toBe(15 * 60 * 1000);
    });

    test("three hours → 3 hours", () => {
        expect(parseTimeToMs("three hours")).toBe(3 * 60 * 60 * 1000);
    });

    test("twenty-five minutes → 25 min", () => {
        expect(parseTimeToMs("twenty-five minutes")).toBe(25 * 60 * 1000);
    });

    test("twentyfive minutes → 25 min", () => {
        expect(parseTimeToMs("twentyfive minutes")).toBe(25 * 60 * 1000);
    });

    // Written-out numbers (Dutch)
    test("twee uur → 2 hours", () => {
        expect(parseTimeToMs("twee uur")).toBe(2 * 60 * 1000 * 60);
    });

    test("vijf minuten → 5 min", () => {
        expect(parseTimeToMs("vijf minuten")).toBe(5 * 60 * 1000);
    });

    test("vijfentwintig minuten → 25 min", () => {
        expect(parseTimeToMs("vijfentwintig minuten")).toBe(25 * 60 * 1000);
    });

    // Special Dutch expressions
    test("kwartier → 15 min", () => {
        expect(parseTimeToMs("1 kwartier")).toBe(15 * 60 * 1000);
    });

    test("drie kwartier → 45 min", () => {
        expect(parseTimeToMs("drie kwartier")).toBe(45 * 60 * 1000);
    });

    test("half uur → 30 min", () => {
        expect(parseTimeToMs("half uur")).toBe(30 * 60 * 1000);
    });

    test("anderhalf uur → 90 min", () => {
        expect(parseTimeToMs("anderhalf uur")).toBe(90 * 60 * 1000);
    });

    // Mixed compound
    test("1 uur en tien minuten → 70 min", () => {
        expect(parseTimeToMs("1 uur en tien minuten")).toBe(70 * 60 * 1000);
    });

    // Ranges
    test("15 of 20 minuten → 20 min (max)", () => {
        expect(parseTimeToMs("15 of 20 minuten")).toBe(20 * 60 * 1000);
    });

    test("10-15 minuten → 15 min (max)", () => {
        expect(parseTimeToMs("10-15 minuten")).toBe(15 * 60 * 1000);
    });

    test("15, 20 minuten → 20 min (max)", () => {
        expect(parseTimeToMs("15, 20 minuten")).toBe(20 * 60 * 1000);
    });

    test("1,5 of 2 uur → 2 hours (max)", () => {
        expect(parseTimeToMs("1,5 of 2 uur")).toBe(2 * 60 * 60 * 1000);
    });

    test("twee of drie kwartier → 45 min (max)", () => {
        expect(parseTimeToMs("twee of drie kwartier")).toBe(45 * 60 * 1000);
    });
});

describe("parseTimeMatches", () => {
    test("finds simple time in sentence", () => {
        const matches = parseTimeMatches("Bak 15 minuten in de oven.");
        expect(matches.length).toBe(1);
        expect(matches[0].fullMatch).toBe("15 minuten");
        expect(matches[0].ms).toBe(15 * 60 * 1000);
    });

    test("finds range time in sentence", () => {
        const matches = parseTimeMatches("Bak 15 of 20 minuten.");
        expect(matches.length).toBe(1);
        expect(matches[0].fullMatch).toBe("15 of 20 minuten");
        expect(matches[0].ms).toBe(20 * 60 * 1000);
    });

    test("finds compound time in sentence", () => {
        const matches = parseTimeMatches("Laat 1 uur en 10 minuten sudderen.");
        expect(matches.length).toBe(1);
        expect(matches[0].fullMatch).toBe("1 uur en 10 minuten");
        expect(matches[0].ms).toBe(70 * 60 * 1000);
    });

    test("finds written-out time in sentence", () => {
        const matches = parseTimeMatches("Bak fifteen minutes.");
        expect(matches.length).toBe(1);
        expect(matches[0].fullMatch).toBe("fifteen minutes");
        expect(matches[0].ms).toBe(15 * 60 * 1000);
    });

    test("finds multiple times in one text", () => {
        const matches = parseTimeMatches("Bak 10 minuten, draai om, en bak nog 5 minuten.");
        expect(matches.length).toBe(2);
        expect(matches[0].ms).toBe(10 * 60 * 1000);
        expect(matches[1].ms).toBe(5 * 60 * 1000);
    });

    test("finds anderhalf uur", () => {
        const matches = parseTimeMatches("Laat anderhalf uur rijzen.");
        expect(matches.length).toBe(1);
        expect(matches[0].ms).toBe(90 * 60 * 1000);
    });

    test("no false positives on normal text", () => {
        const matches = parseTimeMatches("Voeg de bloem en het ei toe.");
        expect(matches.length).toBe(0);
    });
});

describe("buildTimerRegex", () => {
    test("splits text around timer matches", () => {
        const regex = buildTimerRegex();
        const text = "Bak 15 minuten in de oven.";
        const parts = text.split(regex);
        // Should have: ["Bak ", "15 minuten", " in de oven."] + capture groups
        expect(parts.some(p => p === "15 minuten")).toBe(true);
    });
});
