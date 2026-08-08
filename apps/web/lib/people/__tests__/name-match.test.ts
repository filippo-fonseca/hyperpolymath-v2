import { describe, expect, it } from "vitest";
import { matchPeopleByName, nameTokens } from "../name-match";

const ASIK = { id: "p-asik", name: "Dr. Mehmet D. Asik" };
const ANNA = { id: "p-anna", name: "Anna Parker" };
const ANNA_TWO = { id: "p-anna2", name: "Anna Kowalski" };
const CESAR = { id: "p-cesar", name: "César Aguilar" };

describe("nameTokens", () => {
  it("drops honorifics, post-nominals and single initials", () => {
    expect(nameTokens("Dr. Mehmet D. Asik")).toEqual(["mehmet", "asik"]);
    expect(nameTokens("Prof. Jane Q. Doe, PhD")).toEqual(["jane", "doe"]);
  });

  it("folds accents so the token is searchable as typed", () => {
    expect(nameTokens("César Aguilar")).toEqual(["cesar", "aguilar"]);
  });
});

describe("matchPeopleByName", () => {
  const roster = [ASIK, ANNA, ANNA_TWO, CESAR];

  it("resolves a surname nobody else owns", () => {
    expect(matchPeopleByName("ask asik about the implant coating", roster)).toEqual([
      "p-asik",
    ]);
  });

  it("resolves the full name as written, honorifics and all", () => {
    expect(matchPeopleByName("met with Dr. Mehmet D. Asik today", roster)).toEqual([
      "p-asik",
    ]);
  });

  it("leaves a shared first name unresolved rather than guessing", () => {
    expect(matchPeopleByName("coffee with anna", roster)).toEqual([]);
  });

  it("resolves a shared first name once the full name is given", () => {
    expect(matchPeopleByName("coffee with anna parker", roster)).toEqual(["p-anna"]);
  });

  it("matches across accents in both directions", () => {
    expect(matchPeopleByName("cesar sent the score", roster)).toEqual(["p-cesar"]);
    expect(matchPeopleByName("César sent the score", roster)).toEqual(["p-cesar"]);
  });

  it("respects word boundaries", () => {
    expect(matchPeopleByName("the basikal is fixed", roster)).toEqual([]);
    expect(matchPeopleByName("annabel came by", roster)).toEqual([]);
  });

  it("returns every distinct person named", () => {
    expect(matchPeopleByName("asik and cesar reviewed it", roster)).toEqual([
      "p-asik",
      "p-cesar",
    ]);
  });

  it("is empty for empty input", () => {
    expect(matchPeopleByName("", roster)).toEqual([]);
    expect(matchPeopleByName("anything", [])).toEqual([]);
  });
});
