import { describe, expect, it } from "vitest";
import {
  ROCKFORD_OOT_PAIRS,
  SINGLE_COL_OOT_PAIRS,
  combineOotNames,
  parseOotNames,
} from "./driverAvailability";

const BURNHAM = `"56","Dave Vanderbilt       ","","30765","Bill Vrtis-T","","37422","John Maxedon",""
"231","Kevin Bray","","32742","Ryan Lollis","","33707","Zachary Valadez","oot"
"575","Devell Nutall","vac","32962","Wayne Smith","","37818","Jeffrey Haynes","OOT"
"2521","Glen Barker","oot","34600","Herbert Hill - T","","39321","Kamaree Marshall",""
"2683","Roy Strickland - T","","13560","Bill Sinks","","39697","Jerome Maxwell","oot"
"2740","Reice Carter-T","","30579","Mike Ellis","","39742","Marshawn Pitts","oot"
"21846","Paris Cochran","","22681","Josh Maciejewski","","40232","Zavier Alexander","oot"
"21859","John Wegner","wc","36640","Nick Zafra","vac","40467","Crandall Wells",""
`;

const ROCKFORD = `"185","Christopher Oleson","","32246","Arthur Williams",""
"1055","Corey Daggert","","34519","Terrance Wyatt","fmla"
"35009","Someone Vac","","36111","Jonaton Garcia","oot"
"2242","Jamie Villapando","wc","34536","James Northrup",""
`;

const PONTIAC = `"95","Frank Ragano",""
"1183","Terry Muzzarelli","vac"
"2382","Mike Davy",""
`;

const ARC = `"100","Francisco Ramirez",""
"366","Roberto Gonzalez","OOT"
"31742","Ariel Sanchez","wc"
`;

const ZION = `"22041","Marcelo Aldana",""
"32817","Chuck Toohey","oot"
"36713","Juan Garcia (Yogi)","vac"
`;

describe("parseOotNames", () => {
  it("collects Burnham B/E/H names when C/F/I is OOT and ignores vac/wc/blank", () => {
    expect(parseOotNames(BURNHAM)).toEqual([
      "Glen Barker",
      "Jeffrey Haynes",
      "Jerome Maxwell",
      "Marshawn Pitts",
      "Zachary Valadez",
      "Zavier Alexander",
    ]);
  });

  it("collects Rockford B and E when C or F is OOT", () => {
    expect(parseOotNames(ROCKFORD, ROCKFORD_OOT_PAIRS)).toEqual(["Jonaton Garcia"]);
  });

  it("collects Pontiac / ARC / Zion B when C is OOT", () => {
    expect(parseOotNames(PONTIAC, SINGLE_COL_OOT_PAIRS)).toEqual([]);
    expect(parseOotNames(ARC, SINGLE_COL_OOT_PAIRS)).toEqual(["Roberto Gonzalez"]);
    expect(parseOotNames(ZION, SINGLE_COL_OOT_PAIRS)).toEqual(["Chuck Toohey"]);
  });

  it("returns an empty list when nobody is OOT", () => {
    expect(parseOotNames(`"1","Pat Driver","","2","Other","","3","Third",""`)).toEqual([]);
  });
});

describe("combineOotNames", () => {
  it("merges yards, dedupes case-insensitively, and sorts", () => {
    expect(
      combineOotNames([
        parseOotNames(BURNHAM),
        parseOotNames(ROCKFORD, ROCKFORD_OOT_PAIRS),
        ["glen barker", "Chuck Toohey"],
        parseOotNames(ZION, SINGLE_COL_OOT_PAIRS),
      ]),
    ).toEqual([
      "Chuck Toohey",
      "Glen Barker",
      "Jeffrey Haynes",
      "Jerome Maxwell",
      "Jonaton Garcia",
      "Marshawn Pitts",
      "Zachary Valadez",
      "Zavier Alexander",
    ]);
  });
});
