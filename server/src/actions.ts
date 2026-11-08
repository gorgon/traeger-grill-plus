import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, desc, eq, lt } from "drizzle-orm";
import * as schema from "./schema";
import { runIntegrationTests } from "./integrationTests";
import { Privileged } from "@space/privileged";

// ---- Meat programs (from brief) ----
export type StageDef = {
  title: string;
  durationMinutes: number;
  grillTemp: number | null;
  probeTarget: number | null;
  superSmoke: boolean;
  completion: "owner" | "probe" | "timer" | "grilltemp";
  ownerAction: boolean;
  claudeDoes: string;
  ownerDoes: string | null;
  speak: string | null;
  details: string;
  // v28 (owner, 17:14 PT): ONE short why-line per stage — what is physically
  // happening to the meat and why this stage's target is the target. It
  // REPLACES the templated number-restating status line on the active card
  // and shows once on the detail sheet. Cap: ≤2 short sentences, ≤200 chars
  // (the owner's longest supplied line is 186 chars).
  why: string;
};
export type ProgramDef = {
  id: string;
  name: string;
  emoji: string;
  totalLabel: string;
  totalMinutes: number;
  difficulty: string;
  description: string;
  probeTarget: number;
  category: "fast" | "slow";
  buy: string[];
  prep: string[];
  stages: StageDef[];
};

export const PROGRAMS: ProgramDef[] = [
  {
    id: "filet", name: "Filet Mignon", emoji: "🥩", totalLabel: "~45–60 min", totalMinutes: 55, difficulty: "Fast · Reverse sear",
    description: "Two center-cut filets, smoked then seared, butter-basted.",
    probeTarget: 130, category: "fast",
    buy: ["Center-cut filets, 8–10 oz each, 1.5–2 in thick", "Kosher salt + cracked black pepper", "Butter, garlic, thyme for basting"],
    prep: ["Salt 1 hr to overnight ahead", "Room temp 30–45 min before cooking", "Pat bone dry, light coat of oil"],
    stages: [
      { title: "Preheat 225°F", durationMinutes: 10, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "Heating to 225°F.", ownerDoes: "Ignite the grill, lid closed. Fill the hopper." , speak: "Igor, ignite the grill now and let it heat to two twenty five.", why: "The grill settles at a low, steady heat so the steak cooks evenly from the start — no hot spots, no rushing.", details: "Set the grill to 225\u00b0F and let it fully preheat with the lid closed, about 10 minutes. Fill the hopper before you ignite so you do not run low mid-cook. The grill is ready when the displayed temp holds steady at 225\u00b0F for a couple of minutes, not the moment it first touches it." },
      { title: "Smoke to 110°F", durationMinutes: 30, grillTemp: 225, probeTarget: 110, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Smoking at 225°F to 110°F internal.", ownerDoes: "Place filets on the grate, probe in the thickest center. Lid closed." , speak: "Igor, put the filets on the grill now, and put the probe in the thickest one.", why: "Low heat and smoke flavor the meat while the center stays rare. Pulling at 110° leaves room for the sear to finish it without overshooting.", details: "Place the filets on the center of the grate, away from the hot edge. Push the probe horizontally into the thickest center of the largest filet, tip in the middle of the meat \u2014 not touching fat or the grate. Close the lid and leave it closed; every peek drops temp and smoke. Pull them at 110\u00b0F internal, which leaves room for the sear to finish them." },
      { title: "Take steaks off", durationMinutes: 3, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Holding your steaks while the grill heats for the sear.", ownerDoes: "YOUR JOB: take the steaks off and tent them loosely." , speak: "Igor, take the steaks off the grill now.", why: "Off the grill, the steaks hold their juices while the heat climbs. A loose tent keeps the surface from steaming soft.", details: "Take the filets off with tongs and set them on a warm plate. Tent loosely with foil \u2014 do not wrap tight or the crust steams soft. Leave the probe out while they rest off the grill. They will sit about 10 minutes while the grill climbs to 500\u00b0F." },
      { title: "Grill to 500°F", durationMinutes: 10, grillTemp: 500, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: false, claudeDoes: "Cranking the grill to 500°F for the sear.", ownerDoes: null , speak: null, why: "A fully hot grate is what makes the crust. At 500° the surface browns in minutes instead of steaming grey.", details: "Close the lid and raise the grill to 500\u00b0F. This is the Pro 575's maximum, so give it the full time to get properly hot \u2014 a weak preheat means a grey, steamed sear instead of a crust. Keep the steaks tented off the grill the whole time." },
      { title: "Sear & baste to 130°F", durationMinutes: 6, grillTemp: 500, probeTarget: 130, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Searing hot and fast to 125–130°F.", ownerDoes: "Sear 2–3 min per side. Butter-baste with garlic + thyme the last minute." , speak: "Time to sear. Put the filets back on the hot grill, and baste with butter at the end.", why: "The sear builds the crust and the butter bastes it rich. 130° is medium-rare — the center stays red and tender.", details: "Put the filets back on the hottest part of the grate. Sear 2\u20133 minutes per side without moving them, then in the last minute spoon foaming butter with crushed garlic and thyme over the tops. Pull at 130\u00b0F for medium-rare; carryover will add a few degrees while they rest." },
      { title: "Rest 10 min", durationMinutes: 10, grillTemp: null, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Grill shutting down. Resting now — don't skip it.", ownerDoes: "Rest 10 min tented, then serve." , speak: "Steaks are done. Take them off and let them rest for ten minutes.", why: "Resting lets the juices settle back into the meat. Cut too early and they run onto the board instead of staying in each bite.", details: "Rest the filets tented for a full 10 minutes before cutting \u2014 cutting early spills the juices onto the board. Serve whole, with the pan butter spooned over. No slicing needed for filet." },
    ],
  },
  {
    id: "ribeye", name: "Ribeye", emoji: "🥩", totalLabel: "~1 hr", totalMinutes: 60, difficulty: "Fast · Reverse sear",
    description: "Thick, well-marbled ribeye with a hard sear and rendered fat edge.",
    probeTarget: 130, category: "fast",
    buy: ["Ribeye 16–20 oz, 1–1.5 in thick, Prime or Choice, well marbled", "Kosher salt + black pepper", "Garlic butter for finishing"],
    prep: ["Salt overnight uncovered in the fridge (best crust)", "Room temp 45 min before cooking", "Pat completely dry"],
    stages: [
      { title: "Preheat 225°F", durationMinutes: 10, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "Heating to 225°F.", ownerDoes: "Ignite the grill, lid closed. Fill the hopper." , speak: "Igor, ignite the grill now and let it heat to two twenty five.", why: "The grill settles at a low, steady heat so the steak cooks evenly all the way through before the sear.", details: "Set the grill to 225\u00b0F, lid closed, hopper filled before ignition. Let it hold 225\u00b0F steady for a few minutes before the steak goes on \u2014 that stability is what gives an even reverse sear." },
      { title: "Smoke to 115°F", durationMinutes: 35, grillTemp: 225, probeTarget: 115, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Smoking at 225°F to 115°F internal.", ownerDoes: "Place ribeye on the grate, probe in the thickest center. Lid closed." , speak: "Igor, put the ribeye on the grill now, and put the probe in the thickest part.", why: "Smoke and gentle heat start rendering the ribeye's fat while the center stays rare. 115° leaves room for a hard sear to finish it.", details: "Place the ribeye center-grate and insert the probe horizontally into the thickest part, avoiding the big fat seams. Lid closed the whole smoke. Pull at 115\u00b0F internal \u2014 slightly higher than filet because the ribeye's fat needs a touch more rendering time in the sear." },
      { title: "Take steak off", durationMinutes: 3, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Holding your steak while the grill heats for the sear.", ownerDoes: "YOUR JOB: take the steak off and tent it loosely." , speak: "Igor, take the ribeye off the grill now.", why: "Off the heat, the steak rests while the grill climbs — its surface stays dry, which is what a good sear needs.", details: "Lift the ribeye off with tongs onto a plate and tent loosely with foil. Do not wrap it tight. It rests off the grill while the temp climbs for the sear; expect about 10 minutes." },
      { title: "Grill to 500°F", durationMinutes: 10, grillTemp: 500, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: false, claudeDoes: "Cranking the grill to 500°F for the sear.", ownerDoes: null , speak: null, why: "The sear needs a fully hot grate. At maximum heat the crust forms fast, before the inside overcooks.", details: "Close the lid and crank the grill to 500\u00b0F, its maximum. Wait until it is fully at temp \u2014 the sear only works on a properly hot grate." },
      { title: "Sear to 130°F", durationMinutes: 7, grillTemp: 500, probeTarget: 130, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Searing to 130°F, fat edge included.", ownerDoes: "Sear ~3 min per side, then hold the fat edge to the heat to render it." , speak: "Time to sear. Put the ribeye back on the hot grill, about three minutes per side.", why: "High heat crusts the outside and renders the fat edge crisp. 130° keeps the marbled center medium-rare and juicy.", details: "Sear about 3 minutes per side. Near the end, use tongs to hold the ribeye on its fat edge against the grate for 30\u201360 seconds to render and crisp the edge. Pull at 130\u00b0F for medium-rare and finish with garlic butter on top while it rests." },
      { title: "Rest 10 min", durationMinutes: 10, grillTemp: null, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Grill shutting down. Resting now.", ownerDoes: "Rest 10 min tented, then slice and serve." , speak: "The ribeye is done. Take it off and let it rest for ten minutes.", why: "Resting keeps the juices in the meat when you slice. Ten minutes is the difference between juicy slices and a wet board.", details: "Rest tented a full 10 minutes. Slice against the grain into thick slices, or serve whole and cut at the table. Spoon the resting juices and garlic butter over the top." },
    ],
  },
  {
    id: "flatiron", name: "Flat Iron", emoji: "🥩", totalLabel: "~45–60 min", totalMinutes: 55, difficulty: "Fast · Reverse sear",
    description: "Tender flat iron — never past 135°F, sliced thin against the grain.",
    probeTarget: 130, category: "fast",
    buy: ["Flat iron steak, 1–1.5 lb", "Salt, pepper, garlic powder", "Chimichurri (optional, for serving)"],
    prep: ["Salt ahead — 1 hr to overnight", "Room temp 30 min before cooking", "Pat completely dry"],
    stages: [
      { title: "Preheat 225°F", durationMinutes: 10, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "Heating to 225°F.", ownerDoes: "Ignite the grill, lid closed. Fill the hopper." , speak: "Igor, ignite the grill now and let it heat to two twenty five.", why: "A low, steady 225° cooks this thin cut gently and evenly, so no part races ahead of the rest.", details: "Set the grill to 225\u00b0F, lid closed, hopper filled first. Let the temp settle at 225\u00b0F before the steak goes on." },
      { title: "Smoke to 110°F", durationMinutes: 25, grillTemp: 225, probeTarget: 110, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Smoking at 225°F to 110°F internal.", ownerDoes: "Place steak on the grate, probe in the thickest center. Lid closed." , speak: "Igor, put the flat iron on the grill now, and put the probe in the thickest part.", why: "Smoke flavors the meat while the center stays rare. Flat iron toughens past medium-rare, so the low pull at 110° protects the finish.", details: "Place the flat iron center-grate, probe horizontally into the thickest end, tip centered. Lid closed. Pull at 110\u00b0F internal \u2014 this cut toughens fast past medium-rare, so the low pull point protects the finish." },
      { title: "Take steak off", durationMinutes: 3, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Holding your steak while the grill heats for the sear.", ownerDoes: "YOUR JOB: take the steak off and tent it loosely." , speak: "Igor, take the flat iron off the grill now.", why: "Off the grill, the steak waits while the heat climbs — a dry surface now means a better crust in the sear.", details: "Take the steak off with tongs, plate it and tent loosely with foil while the grill heats for the sear. Do not wrap tightly." },
      { title: "Grill to 500°F", durationMinutes: 10, grillTemp: 500, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: false, claudeDoes: "Cranking the grill to 500°F for the sear.", ownerDoes: null , speak: null, why: "Maximum heat, fully soaked in, is what crusts a thin steak quickly without cooking it through.", details: "Close the lid and raise the grill to 500\u00b0F, the unit's maximum. Give it the full time to get properly hot before searing." },
      { title: "Sear to 130°F", durationMinutes: 7, grillTemp: 500, probeTarget: 130, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Searing to 130°F — never past 135°F on this cut.", ownerDoes: "Sear 3–4 min per side to 130°F." , speak: "Time to sear. Put the flat iron back on the hot grill. Do not cook it past one thirty five.", why: "A fast, hot sear browns the outside while the inside stays tender. Past 135° this cut turns chewy — the number is the guardrail.", details: "Sear 3\u20134 minutes per side to 130\u00b0F and no further \u2014 never past 135\u00b0F on flat iron, it turns chewy. If you are using chimichurri, keep it off the grill; it goes on fresh at serving." },
      { title: "Rest 10 min", durationMinutes: 10, grillTemp: null, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Grill shutting down. Resting now.", ownerDoes: "Rest 10 min tented." , speak: "The flat iron is done. Take it off and let it rest for ten minutes.", why: "Resting lets the juices redistribute. Because you will slice it thin, every drop kept in the meat matters.", details: "Rest tented 10 minutes. Resting matters doubly for this cut because you will slice it thin and do not want the juices on the board." },
      { title: "Slice thin, against the grain", durationMinutes: 5, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Time to slice — thin is everything on flat iron.", ownerDoes: "Slice thin against the grain. Chimichurri on top if you have it." , speak: "Igor, slice the flat iron thin, against the grain.", why: "Slicing thin across the grain shortens the muscle fibers — that is what makes each bite tender instead of chewy.", details: "Find the direction the muscle fibers run and slice thin \u2014 about 1/4 inch \u2014 across (against) that grain, at a slight angle. Thin against-the-grain slices are what make flat iron tender. Spoon chimichurri over if using." },
    ],
  },
  {
    id: "tritip", name: "Tri-Tip 2–3 lb", emoji: "🔥", totalLabel: "~1.5–2 hrs", totalMinutes: 115, difficulty: "Fast · Reverse sear",
    description: "Whole 2–3 lb tri-tip, smoked low then seared hot. Slice against the grain — there are two.",
    probeTarget: 130, category: "fast",
    buy: ["Whole tri-tip, 2–3 lb, Choice or better", "Coarse salt, black pepper, garlic powder", "Hickory or oak pellets"],
    prep: ["Trim silverskin, keep the thin fat cap", "Salt 1 tsp per lb, fridge uncovered 4–24 hrs", "Out 45 min before cooking, pat dry"],
    stages: [
      { title: "Preheat 225°F", durationMinutes: 15, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "Heating to 225°F.", ownerDoes: "Ignite the grill, lid closed. Fill the hopper with hickory or oak." , speak: "Igor, ignite the grill now and let it heat to two twenty five.", why: "A steady 225° gives this big roast an even start — the thick and thin ends cook at the same pace.", details: "Set the grill to 225\u00b0F, hopper filled with hickory or oak, lid closed. Let it hold 225\u00b0F steady before the meat goes on. A 2\u20133 lb tri-tip needs the full preheat for an even smoke." },
      { title: "Smoke to 115°F", durationMinutes: 70, grillTemp: 225, probeTarget: 115, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Smoking fat-side up at 225°F to 115°F internal.", ownerDoes: "Place tri-tip fat-side up, probe in the thickest center. Lid closed." , speak: "Igor, put the tri-tip on the grill, fat side up, and put the probe in the thickest part.", why: "Fat-side up, the cap bastes the meat as it renders, and smoke builds the flavor. 115° leaves room for the sear to finish it.", details: "Place the tri-tip fat-side up in the center of the grate. Insert the probe into the thickest center, away from the thin tail. Lid closed the entire smoke \u2014 expect roughly 60\u201375 minutes to reach 115\u00b0F internal. The fat cap bastes the meat as it renders." },
      { title: "Take meat off & tent", durationMinutes: 5, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Holding the meat while the grill heats for the sear.", ownerDoes: "YOUR JOB: take the meat off and tent it loosely with foil." , speak: "Igor, take the tri-tip off the grill now, and tent it with foil.", why: "Off the heat, the roast holds while the grill climbs. A loose tent keeps the crust from steaming soft.", details: "Take the tri-tip off with tongs, set it on a board or plate and tent loosely with foil while the grill climbs to searing temp. Do not wrap it tight or the developing crust softens." },
      { title: "Grill to 500°F", durationMinutes: 10, grillTemp: 500, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: false, claudeDoes: "Cranking the grill to 500°F for the sear.", ownerDoes: null , speak: null, why: "A genuinely hot grate crusts a roast this size in minutes per side — that is the whole point of the reverse sear.", details: "Close the lid and raise the grill to 500\u00b0F, the maximum. Let it come fully to temp \u2014 a tri-tip this size needs a genuinely hot grate to crust in just a few minutes per side." },
      { title: "Sear to 130°F", durationMinutes: 8, grillTemp: 500, probeTarget: 130, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Searing hot to 130°F for medium-rare.", ownerDoes: "Sear ~4 min per side to 130°F." , speak: "Time to sear. Put the tri-tip back on the hot grill, about four minutes per side.", why: "The sear adds the crust the smoke phase could not. 130° is medium-rare in the thick part; the thin end rides a little further, as it should.", details: "Sear about 4 minutes per side to 130\u00b0F for medium-rare. Work quickly and keep the lid closed between flips. Pull it as soon as the probe reads 130\u00b0F in the thickest part; the thin end will be a bit more done, which suits most tables." },
      { title: "Rest 15 min", durationMinutes: 15, grillTemp: null, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Grill shutting down. Resting now — don't cut early.", ownerDoes: "Rest 15 min tented." , speak: "The tri-tip is seared. Take it off and let it rest for fifteen minutes.", why: "A roast this size needs the full rest — juices redistribute and the temperature evens out between the thick and thin ends.", details: "Rest tented a full 15 minutes \u2014 a roast this size needs it. Juices redistribute and the temp evens out between the thick and thin ends." },
      { title: "Slice against the grain", durationMinutes: 5, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Slicing is the whole game on tri-tip.", ownerDoes: "The grain turns at the notch — cut there first, then slice each half against its grain." , speak: "Igor, slice the tri-tip against the grain. Cut at the notch first, where the grain turns.", why: "Tri-tip's grain turns halfway. Slicing across each section's grain keeps the slices tender; with the grain, the same meat chews tough.", details: "Tri-tip has two grains that turn at the notch in the meat. Cut the roast in two at that notch first, then slice each piece against its own grain, about 1/4 to 1/2 inch thick. Slicing with the grain is the one mistake that makes tri-tip chewy no matter how well it was cooked." },
    ],
  },
  {
    id: "salmon", name: "Salmon", emoji: "🐟", totalLabel: "~45 min", totalMinutes: 45, difficulty: "Fastest",
    description: "Gentle smoke, silky center. The weeknight hero.",
    probeTarget: 145, category: "fast",
    buy: ["Salmon fillet with skin, ~1.5 lb", "Salt, pepper, brown sugar or your rub", "Lemon + cedar plank (optional)"],
    prep: ["Pat very dry — dry surface takes smoke best", "Season just before cooking", "Skin-side down, don't move it once placed"],
    stages: [
      { title: "Ignite & preheat to 225°F", durationMinutes: 10, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "Ready at 225°F.", ownerDoes: "Power on and ignite. Pat salmon dry, season, skin-side down on a plank or directly on the grate." , speak: "Igor, ignite the grill, season the salmon, and place it skin side down.", why: "Gentle heat is the whole method — salmon dries out fast when it is rushed. A dry, seasoned surface takes the smoke best.", details: "Set the grill to 225\u00b0F and ignite with the lid closed. While it heats, pat the salmon completely dry with paper towels, season it, and set it skin-side down on a cedar plank or directly on a clean, oiled grate. Dry skin and surface are what let the smoke stick and the skin crisp." },
      { title: "Smoke to 145°F internal", durationMinutes: 30, grillTemp: 225, probeTarget: 145, superSmoke: false, completion: "probe", ownerAction: false, claudeDoes: "Holding 225°F. I'll call it at 145°F — not a degree past for silky texture.", ownerDoes: null , speak: null, why: "At 225° the fillet cooks slowly and stays silky. 145° is fully cooked but still moist; a few degrees past it, the texture goes dry.", details: "Smoke at 225\u00b0F until the probe in the thickest part reads 145\u00b0F, about 30 minutes. Do not move or flip the fillet \u2014 skin-side down the whole time protects the flesh. The center should look just opaque and flake in large pieces; pull it on time, salmon dries out fast past target." },
      { title: "Serve", durationMinutes: 5, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Grill shutting down. Dinner's ready.", ownerDoes: "Plate it right away with lemon. No rest needed." , speak: "Igor, the salmon is done. Take it off and serve it now with lemon.", why: "Salmon needs no rest — its delicate flakes are best the moment they come off the heat, with lemon over the top.", details: "Serve straight off the grill \u2014 salmon does not need a rest. Lift it with a wide spatula so the skin stays intact, plate with lemon wedges, and eat right away." },
    ],
  },
  {
    id: "chicken", name: "Whole Chicken", emoji: "🍗", totalLabel: "~1.5 hrs", totalMinutes: 90, difficulty: "Easy",
    description: "Crisp skin, juicy breast. Spatchcock if you want it faster and more even.",
    probeTarget: 165, category: "fast",
    buy: ["Whole chicken, 3.5–4.5 lb", "Salt, pepper, garlic + herb rub", "Butter for under the skin (optional)"],
    prep: ["Salt ahead, fridge uncovered for crisp skin", "Spatchcock for faster, more even cooking (optional)", "Room temp 30 min, pat dry"],
    stages: [
      { title: "Ignite & preheat to 375°F", durationMinutes: 15, grillTemp: 375, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "I'll confirm 375°F for crisp skin.", ownerDoes: "Power on and ignite. Season the bird, probe in the thickest breast, place it on the grate." , speak: "Igor, ignite the grill, season the chicken, and put it on the grate with the probe in the breast.", why: "375° is hot enough to crisp the skin while the meat cooks through — lower and the skin stays rubbery.", details: "Set the grill to 375\u00b0F and ignite, lid closed. While it heats, season the bird all over (and under the skin if you are using butter), then insert the probe into the thickest part of the breast without touching bone. Place the chicken breast-up on the grate." },
      { title: "Roast to 165°F internal", durationMinutes: 60, grillTemp: 375, probeTarget: 165, superSmoke: false, completion: "probe", ownerAction: false, claudeDoes: "Holding 375°F, probe target 165°F in the breast (175°F thigh is fine too).", ownerDoes: null , speak: null, why: "The breast is done at 165° — safe, and still juicy if you pull it on time. The dark meat tolerates more, so the breast is the number to watch.", details: "Roast at 375\u00b0F until the breast probe reads 165\u00b0F, about 60 minutes for a 3.5\u20134.5 lb bird. The thigh can read up to 175\u00b0F and stays juicy. Keep the lid closed; if the skin browns too fast on one side, rotate the bird once halfway." },
      { title: "Rest & carve", durationMinutes: 15, grillTemp: null, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Grill shutting down. Resting redistributes the juices.", ownerDoes: "Rest 15 minutes tented, then carve." , speak: "Igor, the chicken is done. Take it off and let it rest fifteen minutes before carving.", why: "Resting lets the juices settle back into the breast. Carve too early and they spill out, leaving the white meat dry.", details: "Take the chicken off, tent loosely with foil and rest a full 15 minutes before carving \u2014 this keeps the breast juicy. Carve after the rest, not before." },
    ],
  },
  {
    id: "brisket", name: "Brisket", emoji: "🥩", totalLabel: "~12–14 hrs", totalMinutes: 780, difficulty: "The big one",
    description: "Texas-style packer. Low, slow, butcher-paper wrap, probe-tender finish.",
    probeTarget: 203, category: "slow",
    buy: ["Whole packer brisket, 12–16 lb, Choice or Prime", "Coarse salt + coarse black pepper (50/50)", "Pink butcher paper + tallow (optional)"],
    prep: ["Trim fat cap to ~1/4 in, square the edges", "Season heavily, fridge uncovered overnight", "Out 1 hr before cooking"],
    stages: [
      { title: "Ignite & preheat to 220°F", durationMinutes: 15, grillTemp: 220, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "I'll watch for the grill to come online and confirm 220°F.", ownerDoes: "Power on and ignite the grill (no remote ignite — this one's yours). Lid closed. Fill the hopper first." , speak: "Igor, fill the hopper, ignite the grill, and let it heat to two twenty.", why: "A long, low cook starts with a full hopper and a settled grill — brisket forgives a lot, but not running out of fuel overnight.", details: "Fill the hopper completely before anything else \u2014 this cook runs overnight-length hours. Ignite and preheat to 220\u00b0F with the lid closed (there is no remote ignite; this step is yours at the grill)." },
      { title: "Smoke at 220°F", durationMinutes: 120, grillTemp: 220, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Smoking at 220°F. I'll monitor temps and the clock.", ownerDoes: "Place brisket fat-side up, probe in the thickest part of the flat. Then close the lid and leave it alone." , speak: "Igor, put the brisket on the grill, fat side up, and put the probe in the thickest part of the flat.", why: "These first hours lay down the smoke and start the bark while the meat is cool and takes smoke best. Nothing to do but leave it alone.", details: "Place the brisket fat-side up in the center of the grate. Insert the probe into the thickest part of the flat, not the point \u2014 the flat is what you judge doneness by. Close the lid and leave it alone; no spritzing or peeking in this first phase." },
      { title: "Cook at 250°F to 175°F internal", durationMinutes: 390, grillTemp: 250, probeTarget: 175, superSmoke: false, completion: "probe", ownerAction: false, claudeDoes: "Bumped to 250°F, probe target 175°F. Expect a stall in the 150s–160s — that's normal, I won't panic and neither should you.", ownerDoes: null , speak: null, why: "The long middle cook melts fat and starts breaking down the tough connective tissue. The stall in the 150s–160s is moisture evaporating — it ends on its own.", details: "The grill holds 250\u00b0F for the long middle cook, targeting 175\u00b0F internal. Expect the stall in the 150s\u2013160s, where the temp can sit flat for hours \u2014 that is evaporative cooling, it is normal, and it ends on its own. Do not raise the temp to fight it." },
      { title: "Wrap in butcher paper", durationMinutes: 10, grillTemp: 250, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Bark should be dark and set. I'll hold 250°F while you wrap.", ownerDoes: "Wrap tightly in pink butcher paper (not foil — better bark) and put it back on, probe re-inserted." , speak: "Igor, wrap the brisket tightly in butcher paper and put it back on the grill.", why: "Wrapping once the bark is dark and set pushes the meat through the stall while keeping the bark intact — paper breathes where foil would steam it soft.", details: "When the bark is dark mahogany and set (it should not smear when you scratch it), lay the brisket on two overlapping sheets of pink butcher paper, wrap tightly, and return it to the grill seam-side down. Re-insert the probe through the paper into the flat. Use paper, not foil \u2014 foil steams the bark soft." },
      { title: "Finish at 250°F to ~203°F, probe-tender", durationMinutes: 180, grillTemp: 250, probeTarget: 203, superSmoke: false, completion: "probe", ownerAction: false, claudeDoes: "Holding 250°F to 203°F. The real test is feel: probe should slide in like room-temp butter.", ownerDoes: null , speak: null, why: "In this range the collagen finishes melting into gelatin and the flat turns tender. The probe sliding in like butter is the real signal; the number just gets you close.", details: "Hold 250\u00b0F until the flat reads about 203\u00b0F, but judge by feel: the probe should slide in and out with almost no resistance, like room-temperature butter. If it tugs, give it another 20\u201330 minutes regardless of the number." },
      { title: "Rest to 140°F", durationMinutes: 60, grillTemp: null, probeTarget: 140, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Grill shutting down. Rest is part of the cook — I'll time it.", ownerDoes: "Keep it wrapped and rest at least 1 hour (up to 3). Don't slice early." , speak: "Igor, the brisket is done. Keep it wrapped and let it rest at least one hour.", why: "Resting is part of the cook: the meat relaxes and reabsorbs its juices. Slice early and the board gets what the slices should have kept.", details: "Keep the brisket wrapped and rest it at least 1 hour, up to 3, before slicing \u2014 slicing early loses the juices the whole cook built. When you do slice, cut the flat against the grain about pencil-thick, and the point thicker or cubed for burnt ends." },
    ],
  },
  {
    id: "pork", name: "Pulled Pork Shoulder", emoji: "🐷", totalLabel: "~9 hrs", totalMinutes: 550, difficulty: "Set & forget",
    description: "Boston butt, low and slow to shred-tender. Forgiving and feeds a crowd.",
    probeTarget: 204, category: "slow",
    buy: ["Boston butt / pork shoulder, 8–10 lb, bone-in", "Pork rub + yellow mustard binder", "Foil or butcher paper for the wrap"],
    prep: ["Mustard binder, then rub generously", "Season overnight in the fridge", "Probe in the center, away from the bone"],
    stages: [
      { title: "Ignite & preheat to 225°F", durationMinutes: 15, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "Smoking at 225°F.", ownerDoes: "Power on and ignite. Rub the shoulder, probe in the center (avoid bone), place fat-side up." , speak: "Igor, ignite the grill, and put the pork shoulder on, fat side up, with the probe in the center.", why: "Low and slow starts with a settled grill and the probe clear of the bone — bone reads hot and would lie about the meat.", details: "Set the grill to 225\u00b0F, hopper filled, and ignite with the lid closed. Rub the shoulder right before it goes on (or uncover it if you seasoned overnight), insert the probe into the center of the meat away from the bone, and place it fat-side up." },
      { title: "Smoke at 225°F to 160°F internal", durationMinutes: 300, grillTemp: 225, probeTarget: 160, superSmoke: false, completion: "probe", ownerAction: false, claudeDoes: "Holding 225°F to 160°F. The stall around 150–160°F can last hours — it's collagen doing its thing.", ownerDoes: null , speak: null, why: "Smoke and time build the bark while the shoulder's collagen slowly converts. The stall around 150–160° is that conversion happening — it is supposed to happen.", details: "Smoke at 225\u00b0F to 160\u00b0F internal, roughly 5 hours. The stall around 150\u2013160\u00b0F can last hours \u2014 it is collagen converting, and it is supposed to happen. Keep the lid closed and let it ride." },
      { title: "Wrap in foil or butcher paper", durationMinutes: 10, grillTemp: 250, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Bumping to 250°F to push through the finish.", ownerDoes: "Wrap tightly and return to the grill, probe back in." , speak: "Igor, wrap the pork shoulder tightly and put it back on the grill.", why: "Wrapping traps moisture and speeds the finish now that the bark is set and the meat has taken its smoke.", details: "Wrap the shoulder tightly in foil or butcher paper with a splash of its own juices if you have them, and return it to the grill with the probe back in the center. The grill goes up to 250\u00b0F for the wrapped finish." },
      { title: "Cook at 250°F to 204°F, probe-tender", durationMinutes: 180, grillTemp: 250, probeTarget: 204, superSmoke: false, completion: "probe", ownerAction: false, claudeDoes: "Holding 250°F to 204°F. Bone should wiggle loose when it's truly done.", ownerDoes: null , speak: null, why: "Near 204° the connective tissue has melted enough for the meat to pull. The bone wiggling loose is the surest sign it is there.", details: "Cook at 250\u00b0F to 204\u00b0F and probe-tender \u2014 the bone should wiggle and pull almost free when it is truly done. If the bone is still locked, keep cooking even if the number looks right." },
      { title: "Rest & pull", durationMinutes: 45, grillTemp: null, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Grill shutting down. Rest, then shred.", ownerDoes: "Rest 45 min wrapped, then pull, discarding big fat pieces. Toss with a little of the juices." , speak: "Igor, the pork is done. Let it rest forty five minutes, then pull it apart.", why: "A wrapped rest keeps the shoulder hot and juicy. Pulling while warm, the meat shreds easily and the juices coat every strand.", details: "Rest wrapped 45 minutes, then pull the meat apart with two forks or by hand with gloves, discarding large hard fat pieces. Toss the pulled pork with a little of the cooking juices so it stays moist." },
    ],
  },
  {
    id: "ribs", name: "Baby Back Ribs 3-2-1", emoji: "🍖", totalLabel: "~5–6 hrs", totalMinutes: 370, difficulty: "Weekend classic",
    description: "3 hours smoke, 2 hours wrapped, 1 hour sauced. Bend-test tender.",
    probeTarget: 203, category: "slow",
    buy: ["Baby back ribs, 2 racks", "Pork rub + yellow mustard binder", "Butter, brown sugar, honey, apple juice + BBQ sauce"],
    prep: ["Pull the membrane off the bone side", "Mustard binder, rub both sides", "Room temp 30 min before cooking"],
    stages: [
      { title: "Ignite & preheat to 180°F", durationMinutes: 10, grillTemp: 180, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "Smoking at 180°F — maximum smoke uptake first.", ownerDoes: "Power on and ignite. Remove the membrane, rub the ribs, place bone-side down." , speak: "Igor, ignite the grill, rub the ribs, and place them bone side down.", why: "The first phase runs extra low because cool meat takes smoke best — most of the ribs' smoke flavor lands in these hours.", details: "Set the grill to 180\u00b0F for the first smoke phase and ignite, lid closed. While it heats: peel the membrane off the bone side of each rack (a paper towel grip helps), rub mustard binder and seasoning on both sides, and place the racks bone-side down." },
      { title: "Smoke — 3 hours at 180°F", durationMinutes: 180, grillTemp: 180, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: false, claudeDoes: "Holding 180°F for 3 hours. Spritz if you like — I'll remind you hourly in the feed.", ownerDoes: null , speak: null, why: "Three low hours build the smoke ring and bark while the meat slowly starts to tenderize. Bone-side down protects the meat from the heat.", details: "Smoke at 180\u00b0F for 3 hours, bone-side down, lid closed. This low first phase is where the ribs take on most of their smoke. If you spritz, do it quickly with apple juice no more than hourly \u2014 every lid lift costs heat." },
      { title: "Wrap in foil with butter & sugar", durationMinutes: 10, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Bumping to 225°F for the wrapped phase.", ownerDoes: "Wrap each rack in foil with butter, brown sugar, and a splash of apple juice. Back on the grill, meat-side down." , speak: "Igor, wrap each rack in foil with butter and brown sugar, and put them back on, meat side down.", why: "Wrapped with butter and sugar, the ribs braise in their own juices — this is where they turn tender, and the sugar melts into the glaze base.", details: "Lay each rack meat-side down on foil with butter pats, a line of brown sugar, and a drizzle of honey or apple juice. Wrap each rack sealed tight and return them to the grill meat-side down. The grill goes up to 225\u00b0F for this phase." },
      { title: "Wrapped cook at 225°F", durationMinutes: 110, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: false, claudeDoes: "Holding 225°F. This is where they get tender.", ownerDoes: null , speak: null, why: "Sealed and hotter, the ribs steam tender. The meat pulls back from the bone ends as the connective tissue gives way.", details: "Cook wrapped at 225\u00b0F for about 2 hours (the '2' in 3-2-1). The foil traps steam and braises the ribs tender \u2014 this is where the texture is made. Leave them sealed the whole time." },
      { title: "Unwrap, sauce & finish", durationMinutes: 50, grillTemp: 225, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Holding 225°F to set the sauce. Bend test: they should crack the bark when lifted.", ownerDoes: "Unwrap, brush with sauce, back on unwrapped to set the glaze." , speak: "Igor, unwrap the ribs, brush them with sauce, and put them back on to set the glaze.", why: "Unwrapped again, the sauce sets into a glaze instead of sliding off. The bend test tells the truth: the rack bends and the bark cracks when it is tender.", details: "Unwrap the racks (watch the hot liquid in the foil), brush them with BBQ sauce, and put them back on unwrapped, bone-side down, at 225\u00b0F for about 1 hour to set the glaze. Test doneness with the bend test: lift a rack from one end with tongs \u2014 the bark should crack and the rack should bend easily without falling apart." },
      { title: "Rest & slice", durationMinutes: 10, grillTemp: null, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: true, claudeDoes: "Grill shutting down.", ownerDoes: "Rest 10 minutes, slice between the bones." , speak: "Igor, the ribs are done. Rest them ten minutes, then slice between the bones.", why: "A short rest lets the juices settle so slicing between the bones stays clean instead of squeezing them out.", details: "Rest 10 minutes, then slice between the bones into individual ribs and serve with extra sauce on the side." },
    ],
  },
  {
    id: "chuckroast", name: "Chuck Roast 2–3 lb", emoji: "🥩", totalLabel: "~6–8 hrs", totalMinutes: 460, difficulty: "Low & slow · Foil-wrapped",
    description: "Angus boneless chuck roast, smoked then foil-wrapped with onions to probe-tender, shred-ready.",
    probeTarget: 203, category: "slow",
    buy: ["Angus boneless chuck roast 2–3 lb, well marbled", "Coarse salt, black pepper, garlic powder", "1 yellow onion, sliced", "Heavy-duty foil", "Optional: 2 tbsp butter", "Optional: foil pan (packet can sit on the grate or in a dry pan)"],
    prep: ["Salt 1 tsp/lb, fridge uncovered overnight", "Out 45 min before cooking", "Pat dry, coat with pepper + garlic rub", "Optional: tie with kitchen twine for an even shape"],
    stages: [
      { title: "Preheat to 250°F", durationMinutes: 15, grillTemp: 250, probeTarget: null, superSmoke: false, completion: "grilltemp", ownerAction: true, claudeDoes: "Heating to 250°F.", ownerDoes: "Ignite the grill, lid closed. Fill the hopper." , speak: "Igor, ignite the grill now and let it heat to two fifty.", why: "The grill settles at temperature so the heat is honest and steady when the meat goes on.", details: "Fill the hopper, ignite the grill and preheat to 250\u00b0F with the lid closed. Let it hold 250\u00b0F steady before the roast goes on \u2014 starting in a still-climbing grill throws off the smoke timing for the whole cook." },
      { title: "Smoke to 165°F", durationMinutes: 210, grillTemp: 250, probeTarget: 165, superSmoke: false, completion: "probe", ownerAction: true, claudeDoes: "Smoking on the grate at 250°F to 165°F internal. I'll monitor temps and time — expect 3–4 hours.", ownerDoes: "Place roast on the grate, probe in the thickest part. Lid closed." , speak: "Igor, put the chuck roast on the grill now, and put the probe in the thickest part.", why: "Smoke sticks to the cool surface and the bark sets. Around 165° the climb stalls as moisture evaporates — that's the cue to wrap.", details: "Place the roast directly on the center of the grate and insert the probe into the thickest part. Smoke at 250\u00b0F to 165\u00b0F internal, roughly 3 to 3.5 hours for a 2\u20133 lb roast. Keep the lid closed; the bark and smoke ring form in this phase, before the foil wrap covers the meat." },
      { title: "Wrap in foil with onions", durationMinutes: 10, grillTemp: 250, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Holding 250°F while you wrap the roast.", ownerDoes: "YOUR JOB: lay sliced onions on double foil, set roast on top, butter on top if using, wrap tightly into a sealed packet — probe stays in, foil crimped around the wire." , speak: "Igor, wrap the chuck roast in foil with the onions.", why: "Foil traps the steam, so the roast starts braising in its own juices instead of drying out. The onion bed keeps it off the foil and adds moisture.", details: "Lay the sliced onions in a pile on a double layer of heavy-duty foil \u2014 they become the bed the roast sits on. Set the roast on top of the onions, add 2 tbsp butter on top if using, and keep the probe in the thickest part of the meat. Wrap tightly into a sealed packet, crimping the foil around the probe wire so steam stays in. The packet can sit directly on the grate or in a dry foil pan. Put it back on the grill at 250\u00b0F." },
      { title: "Wrapped finish to 203°F, probe-tender", durationMinutes: 165, grillTemp: 250, probeTarget: 203, superSmoke: false, completion: "probe", ownerAction: false, claudeDoes: "Cooking wrapped at 250°F to 203°F. The real test is probe-tender — it should slide in with no resistance.", ownerDoes: null , speak: null, why: "Wrapped, the roast braises while its collagen melts into gelatin — that's what makes it tender. Near 203° the probe slides in with almost no resistance; that feel is the finish line.", details: "Cook sealed at 250\u00b0F until the meat reads 203\u00b0F and is probe-tender \u2014 the probe should slide in with no resistance, about 2 to 3 hours. The roast steams in its own juices and the moisture from the onions \u2014 no broth needed. The bark will soften inside the foil; that is expected with a wrapped finish. It may take a touch longer than the old broth version, so pull on probe tenderness, not the clock. If it still tugs at 203\u00b0F, reseal and keep cooking." },
      { title: "Take packet off the grill", durationMinutes: 5, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Grill shutting down. Wrapped finish is done.", ownerDoes: "YOUR JOB: take the foil packet off the grill — it's hot and full of juices, use two hands." , speak: "The chuck roast is ready. Take the foil packet off the grill.", why: "Off the heat, the climb stops. Kept sealed, the juices stay in the meat instead of running out.", details: "Take the foil packet off the grill with two hands and oven mitts \u2014 it is hot, flexible, and full of juices. If you used a dry pan, lift that instead. Set it on a heatproof surface and keep it sealed. Shut the grill down." },
      { title: "Rest covered 45 min", durationMinutes: 45, grillTemp: null, probeTarget: null, superSmoke: false, completion: "timer", ownerAction: false, claudeDoes: "Resting covered — juices redistribute and the meat relaxes for shredding.", ownerDoes: null , speak: null, why: "Resting lets the juices redistribute and the fibers relax, so shredding stays moist instead of squeezing the meat dry.", details: "Leave the roast sealed in its foil packet for the full 45 minutes. Resting in its own juices and onion moisture keeps it moist and lets the fibers relax so it shreds instead of tearing. Do not open the foil early." },
      { title: "Shred with two forks", durationMinutes: 10, grillTemp: null, probeTarget: null, superSmoke: false, completion: "owner", ownerAction: true, claudeDoes: "Time to shred — it should pull apart easily.", ownerDoes: "Shred with two forks (or slice thick). Toss with the juices and onions from the packet." , speak: "Rest is over. Shred the chuck roast now.", why: "Warm meat pulls apart easily. Mix the packet juices back through so every bite carries them.", details: "Unwrap carefully \u2014 hot steam will escape. Shred the meat with two forks right on the foil or in a pan \u2014 it should pull apart with almost no effort. Discard any large unrendered fat pieces, toss the shredded meat through the juices and soft onions from the packet so every piece is coated, and serve." },
    ],
  },
];


// ---- Business requirements registry (R1–R9) — single source for Spec view + tests ----
export type RequirementDef = { id: string; title: string; description: string; scenarios: { id: string; name: string; manual?: string }[] };
export const REQUIREMENTS: RequirementDef[] = [
  { id: "R1", title: "Real grill state rules everything", description: "Raw grill states are first-class — 99 Offline, 3 Idle, 5 Igniting, 6 Cooking. No timer or progress runs while the grill isn't actually cooking; the stage timer is held while Idle or Offline.", scenarios: [{ id: "T01", name: "Idle snapshot → timer held, no progress" }, { id: "T02", name: "Igniting snapshot → Igniting, never Not-ignited" }, { id: "T03", name: "Offline (99) → Offline label" }] },
  { id: "R2", title: "Recipe drives the grill", description: "The active stage's target is the grill's target. Drift is detected, a correction is requested, Muse executes it on the grill, and a confirming snapshot marks it confirmed. Reading cadence tightens near probe targets on Muse's monitor side.", scenarios: [{ id: "T11", name: "Setpoint mismatch → correction requested → confirming snapshot → confirmed" }, { id: "T12", name: "Out-of-range setpoint rejected (grill 165–500°F)" }] },
  { id: "R3", title: "Stage advancement", description: "Every stage completes one way: owner, probe, timer, or grill-temp. The Done button exists only on owner stages. Monitored stages auto-advance when their condition is truly met; a manual advance on a monitored stage is rejected on the server. Auto-advancing onto an owner stage fires the alarm with the exact instruction. A probe stage's time-left is dynamic — computed on the server from the probe's actual rise rate over the trailing 10 minutes (widening to 30 when sparse): a flat probe shows an honest stall state with no countdown, and the nominal stage estimate appears only as a fallback. Amendment (v27): the estimate is computed from CURRENT-STAGE data only — the window floor is the active session's stage start, the stored stage-start probe reading is the window's first point, and readings from earlier stages (or carried-forward rows stamped before the stage began) never count toward the rate; the trailing 10-minute window (widening to 30) stays within the stage, and the rate is sanity-clamped to a physically plausible low-and-slow band (≤1.5°F/min) on top of the spike clamp. Until at least 2 in-stage points spanning at least 2 minutes exist, the estimate honestly shows a learning state instead of a number. The estimate carries asOf — the timestamp of the newest reading behind it — and the displayed time-left is a live countdown: it ticks down every second between data arrivals, anchored to that asOf, and every fresh dashboard or poll re-anchors it; if the anchored countdown reaches zero while the probe is still below target it holds at “≈0 — any moment”, never negative and never a newly invented number, until fresh data re-anchors it. A stall still shows the honest stall display with no countdown — the tick-down never fakes one.", scenarios: [{ id: "T04", name: "Manual advance on a probe stage → rejected" }, { id: "T05", name: "Manual advance on a grill-temp stage → rejected" }, { id: "T06", name: "Manual advance on a timer stage → rejected" }, { id: "T07", name: "Done works on an owner stage" }, { id: "T08", name: "Probe crossing target → auto-advance, next owner alarm armed" }, { id: "T38", name: "Probe time-left: dynamic from the current stage's rise rate; stall → no countdown; just-changed stage → learning" }, { id: "T51", name: "Probe estimate line is a single line in every state (dynamic / stall / fallback / learning)" }, { id: "T66", name: "Stage-boundary exclusion: fast pre-stage readings cannot inflate the rate (the 24-min regression); in-stage rate sanity-clamped to ≤1.5°F/min" }, { id: "T67", name: "Estimate asOf + live tick-down: anchored countdown ticks between updates, holds at ≈0 / any moment (never negative), stall stays honest" }] },
  { id: "R4", title: "Alarm discipline", description: "Siren + spoken instruction repeat until acknowledged. Acknowledgements persist on the server per session + stage + kind and survive reloads and rebuilds. A reality cross-check auto-acknowledges actions the snapshot proves already done. The app opens on the relevant screen for the cook's actual position; the alarm overlay appears only for new, genuinely due, unacknowledged owner actions. Amendment (v27): on every app open / full load and every return to the foreground, the cook view scrolls once so the CURRENT stage card is in view (smooth, with a small offset for the header) — exactly once per open/foregrounding: polls, refreshes and re-renders never re-scroll, and an owner who has scrolled away is left alone until the next open or foregrounding. With no active cook, the existing landing behavior (last picked meat) is unchanged. Speech unlock (v28): iOS speaks only for a page session a user gesture has unlocked, so the unlock (silent utterance + AudioContext resume) runs on the FIRST interaction anywhere in the app and is re-established on every page load — including after the self-reload onto a new build, which starts locked again. The fire path is siren → the stage's EXACT phrase → pause, up to 5 repeats, until acknowledged; until a session is unlocked the visual overlay carries the alarm alone — the app never claims voice the platform hasn't enabled.", scenarios: [{ id: "T09", name: "Ack persists across fresh dashboard loads" }, { id: "T10", name: "Reality check auto-acks place-meat when Cooking + probe in meat" }, { id: "T68", name: "Scroll-to-current-stage decision: scrolls once per open/foreground generation, never on polls or re-renders, never without an active cook" }, { id: "T76", name: "Alarm speech: the fire path speaks the stage's exact phrase verbatim, repeats until ack (max 5), and the unlock directive fires on the first gesture of every page session (post-reload starts locked)" }, { id: "M3", name: "Cook view visibly lands on the current stage card on open and on return to the foreground", manual: "The sandbox cannot assert WebView scroll position or smooth-scroll rendering — the scroll DECISION logic (once per open/foregrounding, keyed by generation + session + stage, never on polls) is covered automatically by T68; the visible landing itself is verified by opening the app on the phone during a cook." }, { id: "M5", name: "Alarm voice is audible on the phone when a stage alarm fires", manual: "The sandbox cannot produce sound or prove iOS speech output — the fire path's text, cadence and unlock state machine are covered automatically by T76. Device check: during a cook, open the app and tap anything once (this unlocks speech for the session), then let an owner stage come due — the siren sounds and the instruction is spoken aloud, repeating until 'Got it'. Before any interaction in a fresh page session iOS may keep speech silent while the overlay shows; that is a platform limit, not an app claim." }] },
  { id: "R5", title: "Minimal, modern UI", description: "Only useful things. One-row header with the checked-age inside it; no Screen-awake chip, no Checking pill, no Latest card. Chips appear only for things needing attention. The wake lock works silently; a repair button appears only when it fails. The checked-age label is grammatical at every age: “just now” under ~45 seconds, “N min ago” (N ≥ 1) under an hour, “1 hr ago” style beyond — never “now ago”, never “0 min ago”. Light and dark themes both ship for every view: the app follows the phone's setting until the owner picks one with the header's icon-only sun/moon toggle, and that choice is remembered across opens and applied before first paint. Keep-awake is self-healing (v28): one canonical directive is evaluated on every trigger — open, visibility return, sentinel release, pageshow, the 15s watchdog tick, video pause, and the first tap after a load — and restarts whichever mechanism is down; while a cook is active the intent persists across the app's self-reload (localStorage flag) so the new page re-arms from its first frame, as far as the platform allows. The header claims awake ONLY while a mechanism is actually live; otherwise it offers the repair tap. One meaning, one place (v28): no screen renders the same fact or instruction twice; detail sheets hold title + facts + a single instruction; no per-stage boilerplate.", scenarios: [{ id: "T22", name: "Dashboard supplies the one-row header data contract" }, { id: "T31", name: "Snapshot-age label: 0s/10s/44s → “just now”, 60s → “1 min ago”, never “now ago”" }, { id: "T33", name: "Theme: saved light/dark choice wins; absent or invalid follows the system" }, { id: "T75", name: "Keep-awake directive: acquire on cook-active open; re-acquire on visibility return and on sentinel release; watchdog re-arms after a drop; video fallback selected when the Wake Lock API is absent; persisted intent re-arms after a reload; awake claimed only while a mechanism is live" }, { id: "T77", name: "One meaning, one place: every stage's detail sheet is title + 3 fact tiles + why-line + its instruction exactly once — no duplicate instruction card, no spoken-phrase section, no boilerplate, no owner chip" }, { id: "M4", name: "Screen stays awake on the phone with the app open and untouched past the auto-lock interval", manual: "The sandbox cannot hold an iOS screen on or observe it sleeping — the keep-awake STATE MACHINE (every re-arm trigger, fallback selection, reload persistence, honest awake state) is covered automatically by T75; the device check is the owner's exact repro: open the app during a cook, put the phone down untouched, and confirm the screen is still on well past the phone's auto-lock time, including after the app has self-reloaded onto a new build." }] },
  { id: "R6", title: "Honest refresh", description: "Refresh is direct only: the tap pulls a fresh status straight from Traeger's API (cached token, auto-renewed from the stored login) and the page updates the moment it lands. Concurrent taps join one in-flight call and live calls stay at least 15 seconds apart. There is NO Muse-mediated check path (v28): since the stored-login live refresh shipped, every refresh — manual tap and auto-refetch alike — talks directly to Traeger's API from the app server; no refresh records a request for anyone, the retired requestStatusCheck endpoint records nothing, and no 'check requested' status line exists anywhere in the UI — the legacy line is DELETED, not hidden, because its mount/unmount shifted the whole layout. When the live pull can't complete, the refresh ends with an honest status (unreachable / timeout / sign-in needed) and nothing else changes hands. Either way the tap's pending state ALWAYS resolves: the direct call settles, a snapshot timestamped at or after the tap ends it, and if none lands within 90 seconds the spinner stops and the button accepts a fresh tap (a 35s watchdog also abandons a call wedged across a redeploy). No state can wedge the header in a checking state. While a check is in flight the header shows exactly ONE refresh indicator: the refresh icon button itself, spinning — there is no second spinner or “checking…” text element beside it; the checked-age label (“just now” / “N min ago”) stays mounted in every phase (only dimmed while checking), so the header row's geometry never changes and a refresh causes ZERO layout shift. Refresh is FAST and measured: the live pull resolves on the FIRST acceptable status — a live publish answering command “90” always counts; a retained payload identical to the stored snapshot does not (it proves nothing about now), while a retained payload carrying newer values does — and the whole listen is capped at 12 seconds, after which the refresh ends with an honest timeout status. Every run records its stage timings (sign-in check/renewal, cloud link, grill answer, total) plus the listen outcome, readable in the light payload and the feed. The MQTT socket is opened through the runtime's configured egress proxy (fetch honors it automatically; a raw WebSocket does not — a direct socket dies at TLS in ~10ms, which is how the v24 bug presented: instant broker death misreported as a 12s “timeout”). Failure honesty is exact: a socket that fails before the subscription is a cloud-link failure (status unreachable, listenOutcome connect_failed / subscribe_failed / link_lost); only a fully subscribed listen that hears nothing for the whole window is a timeout (listenOutcome silent), so a timeout's recorded listenMs always matches the configured listen window. Refresh results and the periodic poll use a LIGHT payload (grill, trends, probe estimate, stage view, session — no programs/history/test bulk) merged into the page in place: values change, nothing remounts, scroll and card heights hold, and the estimate and auto-advance lines render single-line (ellipsis, never wrapped). Stage-level diagnosis (v26): the proxy fetch is timed separately (proxyMs) so listenMs measures the socket alone, the record carries whether the privileged executor actually supplied a proxy (proxyPresent), and when a listen dies before subscribing the broker path is probed stage by stage from inside the privileged executor — the timing record names the exact failing stage (failStage: proxy_connect / tls / ws_upgrade / worker_socket / probe_unavailable) with a sanitized error class only, never the proxy value, credentials, or the signed URL. When every transport stage proves healthy from the privileged context (failStage worker_socket), the listen is retried once inside the privileged executor — the context that reads the proxy from its own environment and opens the socket there — and its payloads are judged by the same retained-vs-live acceptance rules. Auto-refetch (v28): while the app is open and VISIBLE with an active cook, it automatically runs the live refresh on a steady ~60s cadence — gate-aware (never overlapping an in-flight live call, never inside the 15s gate; a manual tap during an auto cycle joins the same server call instead of duplicating it). The cycle pauses while the page is hidden; on return to the foreground it refreshes promptly (alongside the scroll-to-current) and resumes the cadence. A failed or unreachable auto-refresh never wedges the cycle: the next scheduled attempt still fires, the checked-age keeps counting honestly, and no freshness is ever faked. While open with an active cook, the app refetches live grill data automatically (~60s cadence, gate-aware); displayed data never sits >~2 min stale for lack of trying.", scenarios: [{ id: "T13", name: "Direct refresh pending: the tap's own pending state is outstanding until a snapshot at/after it lands; no check request is recorded anywhere (the retired endpoint is silent)" }, { id: "T32", name: "Unanswered direct refresh resolves at the 90s bound — spinner off, button live, no status line rendered, never stuck" }, { id: "T37", name: "Live refresh gate: concurrent taps join, 15s minimum between live calls" }, { id: "T47", name: "Header renders exactly one checking indicator (the refresh button); the age label never becomes “checking…”" }, { id: "T48", name: "Light payload carries the cook-view fields and excludes programs/history/test bulk" }, { id: "T49", name: "Refresh timing record: stage timings on every path; retained-vs-live acceptance matrix; 12s listen cap" }, { id: "T50", name: "Header geometry invariant: age-label content depends only on age, never on the refresh phase, and no check-note line exists in any phase — page structure is identical across refresh phases" }, { id: "T57", name: "Listen machine vs a scripted broker socket: instant pre-CONNACK death → connect_failed at once (never a fake 12s timeout); death after CONNACK → subscribe_failed; subscribed silence → silent at the cap; retained-identical waits, live publish accepted; retained-newer accepted as retained" }, { id: "T58", name: "Egress proxy resolution for the MQTT socket: HTTPS_PROXY wins, lowercase + ALL_PROXY fallbacks, blank/absent → null (direct)" }, { id: "T70", name: "Auto-refetch cadence: the scheduler fires liveRefresh on the ~60s cadence while open + visible + active cook with zero user input; the verified time advances across scripted cycles" }, { id: "T71", name: "Auto-refetch gate discipline: never fires while a live call is in flight (a manual tap joins instead); attempts never land inside the 15s gate and never closer than the cadence" }, { id: "T72", name: "Auto-refetch visibility: hidden → no attempts; visible again → prompt gate-aware attempt, then the cadence resumes; no active cook → never fires" }, { id: "T73", name: "Auto-refetch failure resilience: an unreachable attempt doesn't stop later attempts, doesn't move the verified time (no fake freshness), and the next scripted cycle lands fresh data" }, { id: "T74", name: "Direct-only refresh: a refresh tap and an auto-refetch cycle create NO check-request feed message and invoke no legacy path; the retired requestStatusCheck endpoint records nothing; the legacy status line is absent in every refresh phase" }, { id: "M1", name: "Live MQTT round-trip against the real grill (signed URL → subscribe → command 90 → fresh status applied)", manual: "Needs the owner's real Traeger sign-in and a powered-on grill — the sandbox suite never attempts a real login. Everything up to the network boundary (gate, token states, payload handling, the shared write path) is covered by T36, T37 and the snapshot scenarios." }] },
  { id: "R7", title: "Tiny sparkline graphs + trend arrow", description: "Each of Grill and Probe shows a tiny sparkline graph (no axes or labels) with a small arrow at its end, drawn ONLY from real snapshot history — the ~2-hour store of pushed snapshots plus typed carry-forward rows; never interpolated or invented points. The display window starts at the last 30 minutes and widens to 60, then the full 2 hours, whenever the narrower window lacks 2 usable points (≥2 points spanning ≥3 minutes), so sparse-but-real history still renders; it renders nothing only when the whole store lacks 2 usable points. During a cook, a server feeder appends a carry-forward row every ~2 minutes from the last known snapshot so history stays continuous between real checks; carry-forward rows are typed as such and never change the snapshot's verified time. The sparkline's LINE takes the same colour as its end arrow. Tone semantics (the owner's rule: “keep it flat — green if it's almost stable; all unexpected arrows are red”): direction comes from the window delta with a stability band — |Δ| ≤ 3°F over the window counts as steady (flat arrow). GRILL while cooking with a setpoint: steady within ±15°F of the setpoint → flat, green; moving TOWARD the setpoint → green; moving AWAY from it (rising further above it, or falling further below it) → red; if the grill is already outside ±15°F of the setpoint, any movement that does not close the gap → red, and steady while far outside the band → red. PROBE during a cook stage: rising → green; steady (a stall is normal) → flat, green; falling → red. During a Rest stage: falling → green, steady → flat green, rising → red. With no cook context or insufficient data there is no arrow. The Grill sparkline carries a faint dashed line at the setpoint while a cook is active. Amendment (v27): the grill judgment is BAND-FIRST and RECENT — the current grill value's distance from the setpoint is judged before any movement: while the current value sits within the ±15°F band the arrow is flat and the line green, regardless of wiggles inside the band. Only when the current value is OUTSIDE the band does movement decide, and the movement judged is the RECENT segment of the window (its last third of points), not the whole window's net change: moving toward the setpoint is green with the arrow pointing in the direction of travel — falling back down toward the setpoint from above (the expected recovery after a lid-open dip and overshoot) is a green DOWN arrow, and rising toward it from below is a green up arrow; moving away is red with the travel-direction arrow; steady far outside the band stays flat red. Probe semantics are unchanged.", scenarios: [{ id: "T14", name: "Rising probe in a cook stage → green rising" }, { id: "T15", name: "Falling probe in a cook stage → red falling" }, { id: "T16", name: "Probe stall in a cook stage → green steady" }, { id: "T17", name: "Insufficient history → no arrow, no sparkline" }, { id: "T24", name: "Sparkline series present with ≥3 points over ≥3 min" }, { id: "T25", name: "Insufficient history → series empty, no sparkline" }, { id: "T26", name: "Grill series includes setpoint reference while cooking" }, { id: "T34", name: "Feeder appends typed carry-forward rows during a cook; lastVerifiedAt untouched" }, { id: "T35", name: "Sparse real history (points ~25 min apart) → trends render via the widened window" }, { id: "T40", name: "Grill falling while below setpoint during a cook → red falling (moving away)" }, { id: "T41", name: "Grill steady within ±5°F of setpoint → flat (steady) + green" }, { id: "T42", name: "Grill rising toward setpoint from below → green" }, { id: "T43", name: "Grill rising away above setpoint → red" }, { id: "T44", name: "Grill falling toward setpoint from above → green; falling away below → red" }, { id: "T45", name: "Grill steady far outside the ±15°F band → flat + red" }, { id: "T46", name: "Probe during Rest: falling → green, steady → flat green, rising → red" }, { id: "T69", name: "Grill trend band-first + recent segment: in-band recovery wiggle → flat green (screenshot case); above band falling → green down; above band rising → red up; below band rising → green up; below band falling → red down; steady far outside → red flat" }] },
  { id: "R8", title: "Continuity", description: "The full session — stage, timing, holds, messages — recovers after restart or rebuild, with stage timing and holds held on the server. The last picked meat is restored. Setpoint ranges are enforced: grill 165–500°F, probe targets 100–215°F. Credentials, at the owner's explicit instruction: the Traeger login (email + password) is stored ONLY in the server-side database so the refresh can re-authenticate unattended — the password is never returned to the page after entry, never in the client bundle or localStorage, and never logged; the cached 24h token is auto-renewed from the stored login when it expires. Muse can still check and command the grill from outside as a fallback.", scenarios: [{ id: "T18", name: "Session, stage and timing intact across fresh loads" }, { id: "T19", name: "Last picked meat round-trip" }, { id: "T36", name: "Stored login: password never reaches any client payload; no login → sign-in needed; dead stored login → honest auth failure" }, { id: "M2", name: "Real Traeger sign-in exchange (stored login → fresh 24h token, auto-renewed on expiry)", manual: "Needs the owner's real Traeger credentials — the suite verifies the credential posture hermetically (T36) and never attempts a real login." }] },
  { id: "R9", title: "No way out mid-cook — and Shutdown always confirms", description: "The cook view has no Cancel control, and cancelling is rejected on the server while the grill is verifiably cooking. The only exits are the final stage completing or Shutdown. Shutdown NEVER acts on a single tap: tapping it opens a confirmation dialog first — stating the current stage and probe temp, that it ends the cook and this session, that the grill will cool down, and that it cannot be undone. Nothing is recorded until “Yes, shut down” is tapped; “Keep cooking”, the backdrop, or ✕ records nothing.", scenarios: [{ id: "T20", name: "Cancel against a Cooking snapshot → rejected, session stays active" }, { id: "T21", name: "Shutdown confirm → session moves to shutdown_requested" }, { id: "T23", name: "Shutdown dialog open / dismissed → nothing recorded, session unchanged" }] },
  { id: "R10", title: "Stage instructions have a lifecycle", description: "A stage's owner instruction is shown BEFORE the stage — as a preview on its upcoming row, so you know what's coming. At the transition it is delivered by the alarm (siren + voice) and the YOUR TURN overlay until acknowledged. Once the stage is active and its start action is done or acknowledged (including the reality auto-ack), the instruction DISAPPEARS from the active card — the card shows only live status: temps, probe progress, auto-advance line, trend. True owner stages (wrap, take off — the act IS the stage) keep their instruction visible while active, because the action is due now; it disappears when Done completes the stage. Completed stages never show instruction text. The stage detail dialog keeps the full instruction for reference at any time. Stage lines teach, not repeat (v28, owner 17:14 PT): each stage carries one short why-line — what's physically happening to the meat and why this stage's target (temperature or duration) is the target, in plain words — shown once on the active card, replacing the templated status line that merely restated the stage's numbers (e.g. 'Cooking wrapped at 250°F to 203°F. The real test is probe-tender'), and once on the detail sheet; nowhere else adds another copy. Templated lines that restate the stage's numbers are forbidden.", scenarios: [{ id: "T27", name: "Upcoming stage row exposes its instruction as a preview" }, { id: "T28", name: "Active probe stage, start action acked → instruction hidden" }, { id: "T29", name: "Active owner stage, unacked → instruction visible (due now)" }, { id: "T30", name: "Owner stage after Done → instruction hidden" }, { id: "T78", name: "Every stage of every program carries a why-line within the cap; the card/sheet show it once and never the number-restating template" }] },
  { id: "R11", title: "Every feature ships with E2E tests", description: "The owner's standing rule: every feature, past and future, ships with automated end-to-end tests in this suite. A change without tests, or with a red suite, does not ship. The suite audits its own coverage on every run (T39): every registered scenario must produce a result. Anything that genuinely cannot be tested in the sandbox — a real Traeger login, a live MQTT round-trip — is marked 'manual verification only' with its reason, never silently untested and never fake-passed.", scenarios: [{ id: "T39", name: "Coverage self-audit: every registered scenario produced a result this run" }] },
  { id: "R12", title: "History opens with the App section", description: "The Status / History view starts with a compact App section: the current build's human version label (Version N — aligned to the build id's vN prefix and bumped by every shipped build) plus the build id, and the time THIS build was built, stamped into the build itself — never derived from test-run times or grill snapshot times. On its own second line, the guard suite's latest status (passed/total + last run time), clearly distinct from the built time. Under those lines, short release notes for the latest 3 releases (current build + the two before it), grouped under each release's version label + built time, sourced from the server-side RELEASE_NOTES list every build prepends to. The data rides the full dashboard payload as appInfo; the light payload does not carry it.", scenarios: [{ id: "T52", name: "appInfo present: version label matches build id; builtAt parseable, not in the future, not older than the previous build; test counts consistent with testRuns" }, { id: "T53", name: "App section lines in order — version/build id, then Built, then Tests — and the light payload carries no appInfo" }, { id: "T54", name: "appInfo.releases: exactly 3 entries, newest first, current entry = current build, each with 1–6 terse non-empty bullets" }] },
  { id: "R13", title: "The app restarts itself onto a new build", description: "A page left open across a redeploy must never keep running the old build or stay wedged: the client knows the build its bundle was compiled from and compares it with the server's live build id (appInfo) on load and on every dashboard refetch (including the visibility-change refresh). A mismatch triggers ONE full page reload per server build — a session-level guard stops any reload loop if the WebView keeps serving the cached old bundle. Refresh state can never wedge the page either: a fresh load always starts with no check in flight, the refresh button is gated only by the bounded check phase (never by a mutation flag), and a refresh call still pending 35s after the tap — e.g. wedged across the server swap — is abandoned and reset.", scenarios: [{ id: "T55", name: "Build recovery: client/server build mismatch → reload; match or unknown client → current; reload-once guard blocks a second reload for the same build" }, { id: "T56", name: "Load-time check state: any restored/in-flight check state resolves to idle on load — never restored as in-flight" }] },
  { id: "R14", title: "Server response contracts", description: "Every published action the client depends on returns its documented response shape — required keys present with the correct types, on success AND on rejection — and a rejection never writes partial state. The dashboard carries the full grill snapshot (numeric temps, ISO verified time), appInfo with its 3 releases, a stageView whose length equals the active program's stage count, a probeEstimate whose state is one of dynamic / stall / fallback / learning and which always carries an asOf field (ISO timestamp of the newest reading behind the estimate, or null when no reading fed it), and suite counts consistent with testRuns; the light payload carries the same core minus the heavy sections, with lastRefreshTiming either null or the complete 13-field timing record (stage timings + listen outcome + the v26 stage diagnostics: proxyMs, proxyPresent, failStage, failErrorClass — sanitized to a stage name and an error class, never a proxy value, credential, or signed URL). liveRefresh returns {ok, status, message, verifiedAt, timing} on EVERY outcome path: on success verifiedAt is a fresh timestamp and the dashboard's lastVerifiedAt equals it; on timeout the timing record's listenMs must match the configured listen window (a ~10ms 'timeout' against a 12s window is the v24 bug and fails the suite); an instantly-dead broker connection is unreachable, never a timeout. The stored Traeger password appears in NO action response. Malformed or unknown-target calls are rejected with the documented error shape and leave server state byte-identical.", scenarios: [{ id: "T59", name: "getDashboard contract: top-level keys + types, grill numerics + ISO verified time, appInfo {label, buildId, builtAtISO, releases[3]}, stageView length = program stage count, testRuns consistency" }, { id: "T60", name: "getLightDashboard contract: core keys + types, heavy sections absent, lastRefreshTiming null or the full 13-field record" }, { id: "T61", name: "liveRefresh contracts on every path (scripted broker): success → fresh verifiedAt == dashboard lastVerifiedAt; subscribed silence → timeout with listenMs ≈ the window; instant death → unreachable + connect_failed; signin_needed / dead-login shapes with timing present" }, { id: "T62", name: "traegerSignIn / traegerSignOut contracts: invalid input rejected + nothing stored; sign-out {ok} + signed-out state; the stored password appears in no action response" }, { id: "T63", name: "Cook-action contracts: startCook / advanceStage / autoAdvanceStage / ackAlarm / hold / bank / correction / shutdown / reconcile success + rejection shapes; rejections leave state byte-identical" }, { id: "T64", name: "Feeder + test-status contracts and handler-level negative cases: {appended, reason} and {requirements, testRuns, gateLine} shapes; unknown-session calls resolve with documented no-op shapes, never a crash or partial write" }, { id: "T65", name: "Stage-diagnosis mapping: probe result → timing failStage matrix (proxy_connect / tls / ws_upgrade pass through with their error class; all-stages-healthy → worker_socket with the broker's HTTP status as the class; no probe → probe_unavailable); socket error messages classify to coarse sanitized classes only (the raw message embeds the signed URL and never survives); seamed hermetic failures record NO invented privileged diagnostics (failStage/proxyPresent stay null)" }] },
];
// Canonical snapshot-age formatter — the header renders exactly this text
// (client fmtAgeShort in App.tsx mirrors it; guarded by test T31).
// <45s "just now"; then "N min ago" with N ≥ 1; then "1 hr ago" style.
export function formatSnapshotAge(ageMs: number): string {
  if (ageMs < 45_000) return "just now";
  const min = Math.max(1, Math.floor(ageMs / 60_000));
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  if (h < 24) {
    if (rem === 0) return h === 1 ? "1 hr ago" : `${h} hr ago`;
    return `${h} hr ${rem} min ago`;
  }
  const d = Math.floor(h / 24);
  return d === 1 ? "1 day ago" : `${d} days ago`;
}

// Canonical refresh-feedback resolution — the header renders exactly this
// (client resolveCheckFeedback in App.tsx mirrors it; guarded by T13 + T32).
// A refresh tap's pending state is "checking" only while no snapshot
// timestamped at or after the tap has landed AND the tap is younger than
// the response window. Past the window it is "unanswered": the spinner
// stops and a fresh tap is allowed — the checking state ALWAYS resolves
// and can never stick, even if no answering snapshot ever arrives. No
// status line is rendered in any phase (v28 — see countHeaderCheckNotes).
export const CHECK_RESPONSE_WINDOW_MS = 90_000;
export type CheckFeedback = { phase: "idle" | "checking" | "unanswered"; canRequest: boolean };
export function resolveCheckFeedback(input: { requestedAtMs: number | null; snapshotVerifiedMs: number | null; nowMs: number }): CheckFeedback {
  const { requestedAtMs, snapshotVerifiedMs, nowMs } = input;
  if (requestedAtMs == null) return { phase: "idle", canRequest: true };
  if (snapshotVerifiedMs != null && snapshotVerifiedMs >= requestedAtMs) return { phase: "idle", canRequest: true };
  if (nowMs - requestedAtMs < CHECK_RESPONSE_WINDOW_MS) return { phase: "checking", canRequest: false };
  return { phase: "unanswered", canRequest: true };
}

// Canonical header refresh-indicator count (R6; client App.tsx mirrors
// this exactly — guarded by T47). While a check is in flight the header
// carries exactly ONE element in the checking state: the refresh icon
// button itself (it spins and stays the tap target). The checked-age
// label is never a checking indicator — it keeps showing the snapshot
// age in every phase. No separate spinner or "checking…" text element
// exists.
export function countHeaderCheckIndicators(input: { phase: "idle" | "checking" | "unanswered" }): number {
  return input.phase === "checking" ? 1 : 0;
}

// Canonical header check-note count (R6, v28 — guarded by T50 + T74).
// The legacy "Check requested — Muse hasn't responded yet" line is
// DELETED from the UI, not hidden: refresh is direct-to-API only, so
// there is no outstanding request to anyone for a line to describe, and
// the element's mount/unmount was itself a layout jump the owner
// reported. In EVERY refresh phase the header renders ZERO check-note
// lines; refresh state is conveyed only by the single refresh
// indicator (countHeaderCheckIndicators) and the checked-age label.
export function countHeaderCheckNotes(input: { phase: "idle" | "checking" | "unanswered" }): number {
  void input;
  return 0;
}

// ---- Keep-awake state machine (R5 amendment, v28; client mirrors —
// guarded by T75) ----
// The v27 failure seam: the sentinel's 'release' event only marked
// state and never re-acquired; a page restored from bfcache never ran
// the mount arming; and after the app's self-reload onto a new build
// (R13) the fresh document had no user gesture, so the video
// fallback's play() could stay rejected with nothing but the 15s
// watchdog retrying — while the phone sat untouched, both mechanisms
// could be down with the page still "visible" and iOS locked the
// screen. The repair is a single directive evaluated on EVERY trigger
// (open, visibility return, sentinel release, pageshow, watchdog tick,
// video pause, first pointerdown): given the live mechanism state it
// says exactly what to (re)start. `awake` is honest — true only while
// a mechanism is ACTUALLY live; `showRetry` is its complement while
// intent is on and the page is visible.
export type KeepAwakeState = { intentOn: boolean; visible: boolean; wakeLockSupported: boolean; sentinelHeld: boolean; videoPlaying: boolean };
export type KeepAwakeDirective = { requestWakeLock: boolean; playVideo: boolean; awake: boolean; showRetry: boolean };
export function keepAwakeDirective(s: KeepAwakeState): KeepAwakeDirective {
  const awake = s.sentinelHeld || s.videoPlaying;
  if (!s.intentOn || !s.visible) return { requestWakeLock: false, playVideo: false, awake, showRetry: false };
  return {
    requestWakeLock: s.wakeLockSupported && !s.sentinelHeld,
    playVideo: !s.videoPlaying,
    awake,
    showRetry: !awake,
  };
}
// Keep-awake intent across the self-reload (R13): while a cook is
// active the client persists a flag; a freshly loaded page (which does
// not know about the session yet) re-arms from its first frame when
// the flag — or an already-loaded active session — says a cook is on.
export function keepAwakeIntent(storedFlag: string | null, hasActiveSession: boolean): boolean {
  return hasActiveSession || storedFlag === "1";
}

// ---- Alarm speech (R4 amendment, v28; client mirrors — guarded by
// T76) ----
// The v27 failure seam: the speech unlock ran ONLY on the COOK tap, so
// a session restored on open — or a page self-reloaded onto a new
// build — had no user gesture in its document and iOS silently
// dropped every speak() the alarm loop made (the old Test Alarm
// "worked" precisely because it was tapped). The repeat plan is the
// fire path's contract: siren first, then the stage's EXACT phrase,
// verbatim, up to 5 repeats, stopping the moment the alarm is acked.
export const ALARM_MAX_REPEATS = 5;
export function alarmRepeatPlan(input: { phrase: string; repeatsDone: number; acked: boolean }): { fire: boolean; text: string | null } {
  if (input.acked || input.repeatsDone >= ALARM_MAX_REPEATS) return { fire: false, text: null };
  return { fire: true, text: input.phrase };
}
// Speech unlock directive: speech is unlocked per PAGE SESSION only —
// every load starts locked (a reload must re-unlock; nothing may
// claim otherwise). The first gesture anywhere attempts the unlock
// (silent utterance inside the gesture handler); later gestures don't
// re-attempt. Before any gesture there is nothing to attempt with.
export function speechUnlockDirective(input: { gestureSeen: boolean; sessionUnlocked: boolean }): { attemptUnlock: boolean; unlocked: boolean } {
  if (!input.gestureSeen) return { attemptUnlock: false, unlocked: input.sessionUnlocked };
  return { attemptUnlock: !input.sessionUnlocked, unlocked: true };
}

// ---- Stage detail sheet blocks (R5 one-meaning-one-place, v28;
// client mirrors — guarded by T77) ----
// The sheet renders EXACTLY these blocks: the title, three compact
// fact tiles, the stage's ONE why-line, and ONE instruction block
// (the stage's details). The
// owner instruction, the spoken phrase and Muse's narration are NOT
// separate blocks — printing them again was the triple-duplication
// the owner photographed. No per-stage boilerplate, no owner chip.
export type StageDetailLike = { title: string; durationMinutes: number; grillTemp: number | null; probeTarget: number | null; details: string; why: string };
export function stageDetailSheetBlocks(stage: StageDetailLike): { title: string; facts: string[]; why: string; instruction: string } {
  const dur = stage.durationMinutes >= 60
    ? (stage.durationMinutes % 60 ? `${Math.floor(stage.durationMinutes / 60)}h ${stage.durationMinutes % 60}m` : `${Math.floor(stage.durationMinutes / 60)}h`)
    : `${stage.durationMinutes}m`;
  return {
    title: stage.title,
    facts: [dur, stage.grillTemp != null ? `${stage.grillTemp}°F` : "Off", stage.probeTarget != null ? `${stage.probeTarget}°F` : "—"],
    why: stage.why,
    instruction: stage.details,
  };
}

// Canonical header age label (R6, zero layout shift — guarded by T50):
// the label's CONTENT depends only on the snapshot's age, never on the
// refresh phase. The client mirrors this by keeping the label mounted in
// every phase and only dimming it while a check is in flight, so the
// header row's geometry is identical in idle, checking, and done states.
export function headerAgeLabel(phase: "idle" | "checking" | "unanswered", ageMs: number): string {
  void phase;
  return formatSnapshotAge(ageMs);
}

// Canonical probe-estimate line (R3 — the client renders exactly this
// text, mirrored by probeEstimateLineText in App.tsx; guarded by T51).
// Always a single line: the client truncates it with an ellipsis rather
// than letting it wrap, so the active stage card never changes height
// when a refresh updates the estimate.
export function fmtCountdownMs(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
// Estimate shape the line formatter consumes — a structural subset of
// ProbeEstimate (the dashboard payload type), so tests can pass plain
// object literals.
export type ProbeEstimateLike = { state: "dynamic" | "stall" | "fallback" | "learning"; timeLeftSeconds: number | null; windowMinutes: number | null; probeTemp: number | null; asOf: string | null };
// Canonical LIVE tick-down (R3 amendment, v27 — the client mirrors this
// as liveProbeSecondsLeft in App.tsx; guarded by T67). A dynamic estimate
// is anchored at the newest reading behind it (asOf): the seconds left
// tick down in real time as now advances past that anchor, recomputed on
// every 1s render tick; each fresh dashboard/poll re-anchors it. The
// result never goes below zero. A null/unparseable anchor (learning,
// stall, fallback lines) leaves the value untouched — those states do
// not tick.
export function tickDownEstimateSeconds(timeLeftSeconds: number, asOfIso: string | null, nowMs: number): number {
  if (asOfIso == null) return timeLeftSeconds;
  const asOfMs = Date.parse(asOfIso);
  if (Number.isNaN(asOfMs)) return timeLeftSeconds;
  const elapsedSec = Math.max(0, Math.floor((nowMs - asOfMs) / 1000));
  return Math.max(0, timeLeftSeconds - elapsedSec);
}
export function formatProbeEstimateLine(
  estimate: ProbeEstimateLike | null,
  nominalLeftSeconds: number,
  stageStartProbe: number | null,
  currentProbeTemp: number,
  nowMs: number,
  probeTarget: number | null,
): string {
  let main: string;
  if (estimate?.state === "dynamic" && estimate.timeLeftSeconds != null) {
    const live = tickDownEstimateSeconds(estimate.timeLeftSeconds, estimate.asOf, nowMs);
    if (live <= 0 && probeTarget != null && (estimate.probeTemp ?? currentProbeTemp) < probeTarget) {
      // The anchored countdown ran out while the probe is still short of
      // target: hold at "any moment" — never negative, never a new
      // invented number — until fresh data re-anchors the estimate.
      main = `≈0 left — any moment (est. from last ${estimate.windowMinutes ?? 10} min)`;
    } else {
      main = `≈${fmtCountdownMs(live * 1000)} left (est. from last ${estimate.windowMinutes ?? 10} min)`;
    }
  } else if (estimate?.state === "stall") {
    main = `— left · probe steady at ${estimate.probeTemp ?? currentProbeTemp}° (stall)`;
  } else if (estimate?.state === "learning") {
    main = "— left · learning this stage's pace";
  } else {
    main = `${fmtCountdownMs((estimate?.timeLeftSeconds ?? nominalLeftSeconds) * 1000)} left (est.)`;
  }
  return stageStartProbe != null ? `${main} · started at ${stageStartProbe}°` : main;
}

// Canonical scroll-to-current-stage decision (R4 amendment, v27 — the
// client mirrors this as shouldScrollToCurrentStage in App.tsx; guarded
// by T68). On every app open / full load (generation 0) and every return
// to the foreground (visibilitychange → visible bumps the generation),
// the cook view scrolls ONCE so the current stage card is in view. The
// decision is keyed by (generation, session, stage): polls, refreshes
// and re-renders with the same key never re-scroll, so an owner who has
// scrolled away is left alone until the next open/foregrounding. With
// no active cook there is nothing to scroll to.
export function shouldScrollToCurrentStageKey(generation: number, sessionId: number | null, stageIndex: number | null, lastKey: string | null): { scroll: boolean; key: string | null } {
  if (sessionId == null || stageIndex == null) return { scroll: false, key: null };
  const key = `${generation}:${sessionId}:${stageIndex}`;
  return { scroll: key !== lastKey, key };
}

// Canonical theme resolution — the client mirrors this exact rule
// (resolveThemePreference in App.tsx; guarded by T33). A saved manual
// choice ("light"/"dark" in localStorage, applied pre-paint via the
// data-theme attribute) always wins; anything else (absent, invalid)
// follows the phone's system preference.
export type ThemePreference = "light" | "dark";
export function resolveThemePreference(stored: string | null, systemPrefersLight: boolean): ThemePreference {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersLight ? "light" : "dark";
}

export const BUILD_ID = "v28-auto-refetch";

// ---- Build identity (R12) — bumped by EVERY shipped build ----
// The bump step for the next builder: increment APP_VERSION_NUMBER by 1,
// rename BUILD_ID to "v<N>-<short-slug>" with the SAME N, move the current
// APP_BUILT_AT_ISO into PREVIOUS_BUILD_AT_ISO, stamp APP_BUILT_AT_ISO
// with the build's own UTC time, set CLIENT_BUILD_ID in client/src/App.tsx
// to the new BUILD_ID, and PREPEND this build's entry to RELEASE_NOTES.
// Guarded by T52: the version label must align with the build id's vN
// prefix and builtAt must be parseable, not in the future, and not older
// than the previous build's stamp.
export const APP_VERSION_NUMBER = 28;
export const APP_VERSION_LABEL = `Version ${APP_VERSION_NUMBER}`;
export const APP_BUILT_AT_ISO = "2026-11-08T01:06:59.000Z";
export const PREVIOUS_BUILD_AT_ISO = "2026-11-08T00:46:04.000Z";

// Owner-timezone (America/Los_Angeles) date-time, e.g. "Nov 7, 2026 ·
// 3:23pm PT" — the History view's App section renders exactly this text
// (client fmtPtDateTime in App.tsx mirrors it; guarded by T52/T53).
export function formatPtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("month")} ${get("day")}, ${get("year")} · ${get("hour")}:${get("minute")}${get("dayPeriod").toLowerCase()} PT`;
}
export function formatBuiltAtLine(builtAtISO: string): string {
  return `Built ${formatPtDateTime(builtAtISO)}`;
}
export function formatAppTestsLine(testsPassed: number, testsTotal: number, testsLastRunAtISO: string | null): string {
  if (testsLastRunAtISO == null || testsTotal === 0) return "Tests: not run yet";
  return `Tests: ${testsPassed}/${testsTotal} passed · ${formatPtDateTime(testsLastRunAtISO)}`;
}
export type AppInfo = {
  versionLabel: string; buildId: string; builtAtISO: string;
  testsPassed: number; testsTotal: number; testsLastRunAtISO: string | null;
  releases: ReleaseNoteEntry[];
};
// Canonical App-section lines (R12) — the History view renders exactly
// these, in this order, FIRST (client mirrors; guarded by T53): version
// line, Built line, Tests line. The built time and the suite status are
// separate lines and never conflated.
export function appSectionLines(info: AppInfo): string[] {
  return [
    `${info.versionLabel} · ${info.buildId}`,
    formatBuiltAtLine(info.builtAtISO),
    formatAppTestsLine(info.testsPassed, info.testsTotal, info.testsLastRunAtISO),
  ];
}

// ---- Release notes (R12) — newest first; every shipped build PREPENDS
// its entry here (part of the bump step). appInfo exposes the latest 3.
// Bullets are terse, max ~6 per release. builtAtISO is null only where
// the exact build stamp was not recorded (v21 predates build stamping).
export type ReleaseNoteEntry = {
  versionLabel: string; buildId: string; builtAtISO: string | null; changes: string[];
};
export const RELEASE_NOTES: ReleaseNoteEntry[] = [
  {
    versionLabel: "Version 28", buildId: "v28-auto-refetch", builtAtISO: APP_BUILT_AT_ISO,
    changes: [
      "Fixed: while a cook is running, the open app now refetches live grill data on its own about every minute — readings no longer sit stale until you tap refresh",
      "Auto-refetch pauses while the app is hidden and refreshes promptly when you come back to it",
      "A failed auto-refresh never wedges the cycle: the next attempt still fires and the checked-age keeps counting honestly",
      "Refresh is direct-only now: the old 'Check requested — Muse hasn't responded yet' line and the Muse-mediated check path behind it are removed completely — every refresh talks straight to Traeger, and the layout no longer jumps",
      "New guard tests (T70–T74) cover the auto-refetch cycle (cadence, gate, visibility, failure resilience) and pin the direct-only refresh path",
      "Keep-awake is self-healing now (re-acquires on wake-lock release, page show, and first tap after a reload; intent survives reloads during a cook); speech unlocks on the first tap anywhere so real alarms speak, not just the test button; stage sheets slimmed to title + facts + one why-line + one instruction — every stage now explains what's happening to the meat and why its target is the target (T75–T78)",
    ],
  },
  {
    versionLabel: "Version 27", buildId: "v27-live-countdown-scroll", builtAtISO: "2026-11-08T00:46:04.000Z",
    changes: [
      "Probe time-left counts down live between updates, anchored to the latest estimate — no more frozen numbers",
      "Time-left now uses only the current stage's readings, so a fast earlier stage can't shrink it",
      "Opening the app (or returning to it) scrolls straight to the current stage",
      "Grill trend: inside the setpoint band the arrow is flat green; settling back toward the setpoint reads green, not red",
    ],
  },
  {
    versionLabel: "Version 26", buildId: "v26-refresh-stages", builtAtISO: "2026-11-08T00:20:32.000Z",
    changes: [
      "Refresh diagnosis: the timing record now names the exact failing stage (proxy / TLS / upgrade / socket)",
      "When the app server's own socket can't reach the broker, the listen retries inside the server's network helper",
      "Proxy fetch timed separately — listen time now measures the grill's answer alone",
    ],
  },
  {
    versionLabel: "Version 25", buildId: "v25-refresh-proxy", builtAtISO: "2026-11-08T00:07:25.000Z",
    changes: [
      "Refresh fixed: the grill's cloud link now goes through the server's egress proxy — fresh readings land again",
      "A dead cloud link now reports “unreachable” honestly instead of a fake 12-second timeout",
      "Refresh timing record shows the listen outcome (payload / connect_failed / silent…)",
      "New R14 contract tests pin every server response shape",
    ],
  },
  {
    versionLabel: "Version 24", buildId: "v24-app-info", builtAtISO: "2026-11-07T23:23:27.000Z",
    changes: [
      "History opens with app version + built time",
      "Release notes for the latest 3 builds",
      "App restarts itself when a new build ships",
      "Stuck refresh state clears itself",
    ],
  },
  {
    versionLabel: "Version 23", buildId: "v23-fast-refresh", builtAtISO: "2026-11-07T23:18:06.000Z",
    changes: [
      "Duplicate refresh indicator removed",
      "Trend arrows: steady = flat green, unexpected = red",
      "Refresh fast: first fresh status wins, 12s cap",
      "Light refresh payload — UI no longer jumps",
    ],
  },
  {
    versionLabel: "Version 21", buildId: "v21-coverage-gate", builtAtISO: null,
    changes: [
      "Light + dark themes with header toggle",
      "History feeder adds a point every 2 min",
      "In-app Traeger sign-in, stored on the server",
      "Self-service live refresh",
      "Dynamic probe time-left from real rise rate",
      "R11 coverage audit in the test suite",
    ],
  },
];
export const LATEST_RELEASES: ReleaseNoteEntry[] = RELEASE_NOTES.slice(0, 3);

// ---- Build recovery (R13) — canonical; client mirrors both helpers ----
// A page instance whose bundle was built for a DIFFERENT build than the
// server is now running is stale code: it must reload to the new build.
// An unknown client build (null) never forces a reload.
export function resolveBuildRecovery(clientBuildId: string | null, serverBuildId: string): "current" | "reload" {
  if (!clientBuildId) return "current";
  return clientBuildId === serverBuildId ? "current" : "reload";
}
// Reload-once guard: never reload twice for the same server build — if
// the WebView keeps serving the old bundle from cache, the page must not
// spin in a reload loop.
export function shouldReloadForBuild(clientBuildId: string | null, serverBuildId: string, alreadyReloadedFor: string | null): boolean {
  return resolveBuildRecovery(clientBuildId, serverBuildId) === "reload" && alreadyReloadedFor !== serverBuildId;
}
// Load-time check state (R13): whatever check state a previous page
// instance had — in-flight, wedged, restored — a fresh load ALWAYS
// starts idle. No check is in flight until the owner taps in THIS page
// instance; the bounded 90s phase logic (T32) governs taps from there.
export function checkStateOnLoad(restored: { requestedAtMs: number | null; inFlight: boolean } | null): { requestedAtMs: null; phase: "idle"; canRequest: true } {
  void restored;
  return { requestedAtMs: null, phase: "idle", canRequest: true };
}

// ---- Verified Traeger history snapshot (Nov 7, 2026 WiFIRE + Traeger.com check) ----
export const TRAEGER_HISTORY = {
  verifiedAt: "Sat Nov 7, 2026 · ~9:20am PT",
  verifiedNote: "Verified directly against Traeger's cloud payload and Traeger.com account area on Nov 7, 2026. Traeger's cloud exposes lifetime counters and the last state report — it does not expose a per-cook history log through this API, so the counters and dated events below are the history Traeger keeps.",
  account: {
    owner: "Igor Podkhodov",
    email: "igor.podkhodov@gmail.com",
    phoneOnFile: null as string | null,
    mailingListSubscribed: false,
    orderHistory: "No orders",
    orderHistoryDetail: "Website order history on Traeger.com shows no orders.",
    communicationPreferences: ["Recipes", "Promotions", "Product Information", "Traegerhood"],
  },
  identity: {
    name: "Our Traeger",
    modelFamily: "Pro 575",
    firmwareJobPackage: "Link_Combined_Pro575",
    deviceTypeId: 2104,
    thingName: "801F12F782F9",
    firmware: "02.02.05",
    firmwareBuild: "20240719.125005",
    configVersion: "04.017",
    maxGrillTemp: 500,
    tempUnits: "°F",
  },
  lifetime: {
    cookCycles: 46,
    runtimeSeconds: 296277,
    runtimeHours: 82.3,
    fanSeconds: 292545,
    fanHours: 81.3,
    augerSeconds: 234552,
    augerHours: 65.1,
    hotRodSeconds: 97683,
    hotRodHours: 27.1,
    greaseTrapCleanCountdown: 0,
    grillCleanCountdown: 0,
  },
  errors: {
    currentErrors: 0,
    currentNote: "No current errors in the last report (errors = 0).",
    lifetime: [
      { label: "Igniter disconnected", count: 8 },
      { label: "Ignite fail", count: 1 },
      { label: "Low temp", count: 1 },
      { label: "Auger disconnected", count: 0 },
      { label: "Auger overcurrent", count: 0 },
      { label: "Bad thermocouple", count: 0 },
      { label: "Fan disconnected", count: 0 },
      { label: "Low ambient", count: 0 },
      { label: "Overheat", count: 0 },
    ],
  },
  settings: {
    wifiSsid: "elkews.com",
    wifiRssi: -61,
    speakerOn: true,
    language: "English (0)",
    pelletSensorEnabled: true,
    pelletSensorConnected: false,
    pelletNote: "Pellet sensor is enabled but NOT connected — no trustworthy pellet level.",
    superSmokeEnabled: false,
    coldSmoke: 0,
    grillMode: 0,
    customCookName: "Chicken Challenge",
    customCookSteps: 1,
    customCookGrillTemp: 425,
    customCookProbeTemp: 170,
  },
  events: [
    {
      dateLabel: "Fri May 15, 2026 · 8:46pm PT",
      title: "Firmware / config job finished — REJECTED",
      detail: "Job “Link_Combined_Pro575_020205_04017” finished with status REJECTED on the grill.",
      kind: "firmware" as const,
    },
    {
      dateLabel: "Sat May 16, 2026 · 2:03pm PT",
      title: "Last report to Traeger's cloud",
      detail: "Grill 85°F, ambient 105°F, probe 89°F, setpoint 165°F. The grill has been offline since this report.",
      kind: "report" as const,
    },
    {
      dateLabel: "Sat Nov 7, 2026 · 9:18–9:20am PT",
      title: "Direct verification against Traeger's cloud",
      detail: "Muse verified the account and grill state directly against Traeger's cloud — first successful direct check. A status-request command was accepted by the cloud (HTTP 200) but the offline grill did not answer.",
      kind: "check" as const,
    },
  ],
};

const grillStateShape = z.object({
  name: z.string(), model: z.string(), firmware: z.string(), connected: z.boolean(),
  lastReportAt: z.string(), lastVerifiedAt: z.string(),
  grillTemp: z.number(), ambientTemp: z.number(), probeTemp: z.number(), probeConnected: z.boolean(),
  setpoint: z.number(), superSmoke: z.boolean(), keepWarm: z.boolean(),
  wifiNetwork: z.string(), wifiSignal: z.number(), pelletSensorConnected: z.boolean(),
  cookCycles: z.number(), customCookName: z.string(), customCookGrillTemp: z.number(), customCookProbeTemp: z.number(),
  systemStatus: z.number(), systemStateLabel: z.string(), cookIdPresent: z.boolean(),
});

export function deriveSystemStateLabel(systemStatus: number, cookIdPresent: boolean, grillTemp: number, setpoint: number): string {
  if (systemStatus === 99) return "Offline";
  if (systemStatus === 3) return "Idle";
  if (systemStatus === 5) return "Igniting";
  if (systemStatus === 6) return "Cooking";
  if (cookIdPresent && grillTemp >= setpoint - 15) return "Cooking";
  if (cookIdPresent && grillTemp < setpoint - 15) return "Heating";
  if (!cookIdPresent && grillTemp > 150) return "Cooling down";
  return `State ${systemStatus}`;
}
const historyShape = z.object({
  verifiedAt: z.string(),
  verifiedNote: z.string(),
  account: z.object({
    owner: z.string(), email: z.string(), phoneOnFile: z.string().nullable(),
    mailingListSubscribed: z.boolean(), orderHistory: z.string(), orderHistoryDetail: z.string(),
    communicationPreferences: z.array(z.string()),
  }),
  identity: z.object({
    name: z.string(), modelFamily: z.string(), firmwareJobPackage: z.string(),
    deviceTypeId: z.number(), thingName: z.string(), firmware: z.string(), firmwareBuild: z.string(),
    configVersion: z.string(), maxGrillTemp: z.number(), tempUnits: z.string(),
  }),
  lifetime: z.object({
    cookCycles: z.number(), runtimeSeconds: z.number(), runtimeHours: z.number(),
    fanSeconds: z.number(), fanHours: z.number(), augerSeconds: z.number(), augerHours: z.number(),
    hotRodSeconds: z.number(), hotRodHours: z.number(), greaseTrapCleanCountdown: z.number(), grillCleanCountdown: z.number(),
  }),
  errors: z.object({
    currentErrors: z.number(), currentNote: z.string(),
    lifetime: z.array(z.object({ label: z.string(), count: z.number() })),
  }),
  settings: z.object({
    wifiSsid: z.string(), wifiRssi: z.number(), speakerOn: z.boolean(), language: z.string(),
    pelletSensorEnabled: z.boolean(), pelletSensorConnected: z.boolean(), pelletNote: z.string(),
    superSmokeEnabled: z.boolean(), coldSmoke: z.number(), grillMode: z.number(),
    customCookName: z.string(), customCookSteps: z.number(), customCookGrillTemp: z.number(), customCookProbeTemp: z.number(),
  }),
  events: z.array(z.object({ dateLabel: z.string(), title: z.string(), detail: z.string(), kind: z.string() })),
});
const stageShape = z.object({
  title: z.string(), durationMinutes: z.number(), grillTemp: z.number().nullable(), probeTarget: z.number().nullable(),
  superSmoke: z.boolean(), completion: z.enum(["owner", "probe", "timer", "grilltemp"]), ownerAction: z.boolean(), claudeDoes: z.string(), ownerDoes: z.string().nullable(),
  speak: z.string().nullable(), details: z.string(), why: z.string(),
});
const programShape = z.object({
  id: z.string(), name: z.string(), emoji: z.string(), totalLabel: z.string(), totalMinutes: z.number(),
  difficulty: z.string(), description: z.string(), probeTarget: z.number(),
  category: z.string(), buy: z.array(z.string()), prep: z.array(z.string()),
  stages: z.array(stageShape),
});
const sessionShape = z.object({
  id: z.number(), meatId: z.string(), meatName: z.string(), status: z.string(),
  currentStageIndex: z.number(), stageStartedAt: z.string(), createdAt: z.string(),
  holdStartedAt: z.string().nullable(),
  stageStartProbe: z.number().nullable(),
  alarmAckedKeys: z.array(z.string()),
}).nullable();
const messageShape = z.object({ id: z.number(), sessionId: z.number().nullable(), kind: z.string(), text: z.string(), createdAt: z.string() });
const correctionShape = z.object({
  id: z.number(), sessionId: z.number(), stageIndex: z.number(),
  fromTemp: z.number(), toTemp: z.number(), status: z.string(), createdAt: z.string(),
}).nullable();

const trendShape = z.object({
  direction: z.enum(["rising", "falling", "steady"]),
  tone: z.enum(["green", "red", "grey"]),
  series: z.array(z.number()),
  reference: z.number().nullable(),
  windowMinutes: z.number(),
}).nullable();
const probeEstimateShape = z.object({
  state: z.enum(["dynamic", "stall", "fallback", "learning"]),
  ratePerMin: z.number().nullable(),
  timeLeftSeconds: z.number().nullable(),
  windowMinutes: z.number().nullable(),
  probeTemp: z.number().nullable(),
  // v27 (R14): ISO timestamp of the newest snapshot behind the estimate
  // — the anchor for the client's live tick-down; null when no snapshot
  // fed the estimate.
  asOf: z.string().nullable(),
}).nullable();
const feedResponse = z.object({ ok: z.literal(true), appended: z.boolean(), reason: z.string() });
const signInResponse = z.object({ ok: z.boolean(), status: z.enum(["ok", "invalid_input", "auth_failed", "unreachable"]), message: z.string(), expiresAt: z.string().nullable() });
export const liveTimingShape = z.object({
  at: z.string(), outcome: z.string(), totalMs: z.number(),
  tokenMs: z.number(), tokenRenewed: z.boolean(),
  mqttMs: z.number().nullable(), listenMs: z.number().nullable(),
  payloadSource: z.enum(["live", "retained"]).nullable(),
  listenOutcome: z.enum(["payload", "connect_failed", "subscribe_failed", "link_lost", "silent"]).nullable(),
  // v26 stage diagnostics (R6/R14): proxyMs times the privileged
  // proxy fetch ALONE (v25 folded it into listenMs, which hid whether
  // the socket died in ~10ms or ~600ms); proxyPresent records whether
  // the privileged executor actually handed back a proxy value (null
  // = the call itself failed, state unknown); failStage names the
  // exact stage that killed a pre-subscription listen, probed from
  // inside the privileged executor — "worker_socket" means every
  // transport stage (proxy CONNECT, TLS, WS upgrade) is healthy from
  // the privileged context, so the failure lives in this worker's own
  // socket; failErrorClass is a sanitized error code (ECONNREFUSED,
  // http_403, ERR_TLS_…) — NEVER the proxy value, credentials, or the
  // signed URL.
  proxyMs: z.number(), proxyPresent: z.boolean().nullable(),
  failStage: z.enum(["proxy_connect", "tls", "ws_upgrade", "worker_socket", "probe_unavailable"]).nullable(),
  failErrorClass: z.string().nullable(),
});
export type LiveRefreshTiming = z.infer<typeof liveTimingShape>;
// Sanitized broker-path probe result, as returned by the privileged
// probeBrokerPath contract (stage names + error class + HTTP status
// only — see server/src/privileged.ts).
export type BrokerProbe = {
  proxyPresent: boolean;
  failStage: "proxy_connect" | "tls" | "ws_upgrade" | null;
  errorClass: string | null;
  httpStatus: number | null;
};
// Canonical mapping (guarded by T65): a probe result → the timing
// record's failStage. A probe that itself could not run is
// "probe_unavailable"; a probe whose stages ALL pass while the
// worker's socket died means the fault is in the worker's socket
// layer ("worker_socket"), with the broker's HTTP status kept as the
// error class (it proves the upgrade reached Traeger's cloud).
export function failStageFromProbe(probe: BrokerProbe | null): { failStage: LiveRefreshTiming["failStage"]; failErrorClass: string | null } {
  if (!probe) return { failStage: "probe_unavailable", failErrorClass: null };
  if (probe.failStage) return { failStage: probe.failStage, failErrorClass: probe.errorClass };
  return { failStage: "worker_socket", failErrorClass: probe.httpStatus != null ? `http_${probe.httpStatus}` : probe.errorClass };
}
const liveRefreshResponse = z.object({ ok: z.boolean(), status: z.enum(["ok", "signin_needed", "auth_failed", "unreachable", "timeout", "too_soon"]), message: z.string(), verifiedAt: z.string().nullable(), timing: liveTimingShape.nullable() });
type LiveRefreshResult = z.infer<typeof liveRefreshResponse>;
type LiveRefreshCore = Omit<LiveRefreshResult, "timing">;
// Lightweight last-refresh timing record (R6): every liveRefresh run —
// success or failure — leaves its stage timings here so the owner (and
// the guard suite) can see exactly where the seconds went. Readable via
// getLightDashboard.lastRefreshTiming and echoed in the liveRefresh
// result itself. In-memory by design: it describes the most recent run
// of THIS server process, nothing durable depends on it.
let lastLiveRefreshTiming: LiveRefreshTiming | null = null;
export function getLastLiveRefreshTiming(): LiveRefreshTiming | null { return lastLiveRefreshTiming; }
export const testRunTestShape = z.object({ id: z.string(), rule: z.string(), name: z.string(), passed: z.boolean(), detail: z.string() });
export const testRunsShape = z.object({
  lastRunAt: z.string().nullable(), buildId: z.string().nullable(),
  passed: z.number(), failed: z.number(), total: z.number(),
  stale: z.boolean(),
  tests: z.array(testRunTestShape),
});
export type TestRunsSummary = z.infer<typeof testRunsShape>;
export async function loadTestRunsSummary(ctx: Ctx): Promise<TestRunsSummary> {
  try {
    const db = ctx.db<typeof schema>();
    const rows = await db.select().from(schema.testRuns).orderBy(desc(schema.testRuns.id)).limit(200);
    if (rows.length === 0) return { lastRunAt: null, buildId: null, passed: 0, failed: 0, total: 0, stale: false, tests: [] };
    const latestMs = Math.max(...rows.map((r) => r.runAt.getTime()));
    const latest = rows.filter((r) => r.runAt.getTime() === latestMs);
    const nameFor = (sid: string) => REQUIREMENTS.flatMap((r) => r.scenarios).find((s) => s.id === sid)?.name ?? sid;
    const tests = latest.map((r) => ({ id: r.scenario, rule: r.rule, name: nameFor(r.scenario), passed: r.passed === 1, detail: r.detail })).sort((a, b) => a.id.localeCompare(b.id));
    // Stale = the stored batch predates this build (its scenarios may be
    // missing entirely, e.g. a test added since); the client auto-runs
    // the suite once when stale so Spec statuses are never ambiguous.
    const stale = (latest[0]?.buildId ?? null) !== BUILD_ID;
    return { lastRunAt: new Date(latestMs).toISOString(), buildId: latest[0]?.buildId ?? null, passed: tests.filter((t) => t.passed).length, failed: tests.filter((t) => !t.passed).length, total: tests.length, stale, tests };
  } catch { return { lastRunAt: null, buildId: null, passed: 0, failed: 0, total: 0, stale: false, tests: [] }; }
}
export type StageViewEntry = { index: number; state: "done" | "active" | "upcoming"; instructionVisible: boolean; instruction: string | null };
// R10 lifecycle: upcoming → instruction visible as preview; active owner
// stage → visible (the act is due now); active monitored stage → visible
// only until its start action is acked / reality-acked; done → never.
export function computeStageView(
  program: ProgramDef,
  currentStageIndex: number,
  ackedKeys: string[],
): StageViewEntry[] {
  return program.stages.map((s, i) => {
    const state: StageViewEntry["state"] = i < currentStageIndex ? "done" : i === currentStageIndex ? "active" : "upcoming";
    let instructionVisible = false;
    if (s.ownerDoes != null) {
      if (state === "upcoming") instructionVisible = true;
      else if (state === "active" && s.completion === "owner") instructionVisible = true;
      else if (state === "active") instructionVisible = !ackedKeys.includes(`${i}-owner`);
    }
    return { index: i, state, instructionVisible, instruction: instructionVisible ? s.ownerDoes : null };
  });
}
const appInfoShape = z.object({
  versionLabel: z.string(), buildId: z.string(), builtAtISO: z.string(),
  testsPassed: z.number(), testsTotal: z.number(), testsLastRunAtISO: z.string().nullable(),
  releases: z.array(z.object({
    versionLabel: z.string(), buildId: z.string(), builtAtISO: z.string().nullable(),
    changes: z.array(z.string()),
  })),
});
const dashboardResponse = z.object({
  grill: grillStateShape, programs: z.array(programShape),
  appInfo: appInfoShape,
  activeSession: sessionShape, messages: z.array(messageShape),
  history: historyShape,
  lastSelectedMeatId: z.string().nullable(),
  activeCorrection: correctionShape,
  trends: z.object({ grill: trendShape, probe: trendShape }),
  probeEstimate: probeEstimateShape,
  traegerAuth: z.object({ signedIn: z.boolean(), email: z.string().nullable(), tokenExpiresAt: z.string().nullable(), tokenValid: z.boolean() }),
  stageConditionMet: z.boolean(),
  testRuns: testRunsShape,
  stageView: z.array(z.object({ index: z.number(), state: z.enum(["done", "active", "upcoming"]), instructionVisible: z.boolean(), instruction: z.string().nullable() })),
});
type Dashboard = z.infer<typeof dashboardResponse>;
// LIGHT payload (R6): everything the cook view needs to update IN PLACE
// after a refresh or on the periodic poll — grill snapshot, trends,
// probe estimate, stage view-model, session, correction, auth state and
// the last refresh timing — WITHOUT the bulk of programs, history, the
// message feed, or test results (~59KB full dashboard → a few KB). The
// client merges these fields into its dashboard cache; the full
// getDashboard stays for initial load and view switches.
const lightDashboardResponse = z.object({
  grill: grillStateShape, activeSession: sessionShape, activeCorrection: correctionShape,
  trends: z.object({ grill: trendShape, probe: trendShape }),
  probeEstimate: probeEstimateShape,
  stageConditionMet: z.boolean(),
  stageView: dashboardResponse.shape.stageView,
  lastSelectedMeatId: z.string().nullable(),
  traegerAuth: dashboardResponse.shape.traegerAuth,
  lastRefreshTiming: liveTimingShape.nullable(),
});
type LightDashboard = z.infer<typeof lightDashboardResponse>;

async function ensureSeed(ctx: Ctx) {
  const db = ctx.db<typeof schema>();
  const existing = await db.select().from(schema.grillState).limit(1);
  if (existing.length === 0) {
    // onConflictDoNothing: concurrent first-load requests (e.g. desktop + mobile)
    // must not race the singleton seed insert into a 500.
    await db.insert(schema.grillState).values({
      id: 1, name: "Our Traeger", model: "Pro 575", firmware: "02.02.05", connected: 1,
      lastReportAt: "Nov 7, 2026", lastVerifiedAt: "Nov 7, 2026",
      grillTemp: 240, ambientTemp: 144, probeTemp: 66, probeConnected: 1, setpoint: 240,
      superSmoke: 0, keepWarm: 0, wifiNetwork: "elkews.com", wifiSignal: -61,
      pelletSensorConnected: 0, cookCycles: 46,
      customCookName: "Chicken Challenge", customCookGrillTemp: 425, customCookProbeTemp: 170,
      lastSelectedMeatId: "chuckroast",
      systemStatus: 6, systemStateLabel: "Cooking", cookIdPresent: 1,
    }).onConflictDoNothing();
  }
}

export function parseAckedKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
}

// Reality check: is this stage's owner start-action evidently ALREADY DONE,
// judging by the grill snapshot? Used to auto-acknowledge start alarms that
// must never replay on app open (e.g. "put the roast on, probe in" when the
// grill is Cooking and the probe is sitting at 80°F in the meat).
export function stageActionEvidentlyDone(
  stageDef: StageDef,
  grill: { probeConnected: boolean; probeTemp: number; systemStatus: number; grillTemp: number; setpoint: number; cookIdPresent: boolean },
  stageStartedAtMs: number,
  stageStartProbe: number | null,
  nowMs: number,
): boolean {
  if (!stageDef.ownerAction) return false;
  const label = deriveSystemStateLabel(grill.systemStatus, grill.cookIdPresent, grill.grillTemp, grill.setpoint);
  const heatingOrCooking = label === "Igniting" || label === "Heating" || label === "Cooking";
  if (!heatingOrCooking) return false;
  const txt = `${stageDef.title} ${stageDef.ownerDoes ?? ""} ${stageDef.speak ?? ""}`.toLowerCase();
  const elapsedMs = nowMs - stageStartedAtMs;
  const isPlaceProbe = txt.includes("probe") && (txt.includes("place") || txt.includes("put") || txt.includes("on the grill") || txt.includes("on the grate"));
  if (isPlaceProbe) {
    if (!grill.probeConnected || grill.probeTemp < 60) return false;
    const probeRisen = stageStartProbe != null && grill.probeTemp >= stageStartProbe + 5;
    return probeRisen || elapsedMs > 15 * 60_000;
  }
  const isIgnite = txt.includes("ignite") || txt.includes("preheat");
  if (isIgnite) return elapsedMs > 2 * 60_000;
  return false;
}

// ---- Stage completion model ----
// Every stage completes exactly one way:
//  - "owner":     the owner's physical act IS the stage (ignite is NOT here —
//                 preheats are grilltemp; place/wrap/take-off/slice are).
//                 Only these stages show the Done button, and only these
//                 accept a manual advanceStage call.
//  - "probe":     ends when the snapshot probe reaches the stage target.
//  - "timer":     ends when the stage duration elapses (server timing,
//                 hold-aware: time banked/held while not ignited never counts).
//  - "grilltemp": preheat-type stages; ends when the grill temp is within
//                 15°F of the stage target while Igniting/Heating/Cooking.
// Monitored stages (probe/timer/grilltemp) advance AUTOMATICALLY via
// autoAdvanceStage (client-triggered on each poll) and from updateGrillState
// when a fresh snapshot satisfies the condition.
export function computeStageConditionMet(
  stageDef: StageDef,
  grill: { probeConnected: boolean; probeTemp: number; grillTemp: number; setpoint: number; systemStatus: number; cookIdPresent: boolean },
  sess: { stageStartedAt: Date; holdStartedAt: Date | null; status: string },
  nowMs: number,
): boolean {
  if (sess.status !== "active") return false;
  if (stageDef.completion === "owner") return false;
  if (stageDef.completion === "probe") {
    return stageDef.probeTarget != null && grill.probeConnected && grill.probeTemp >= stageDef.probeTarget;
  }
  if (stageDef.completion === "grilltemp") {
    if (stageDef.grillTemp == null) return false;
    const label = deriveSystemStateLabel(grill.systemStatus, grill.cookIdPresent, grill.grillTemp, grill.setpoint);
    if (label !== "Igniting" && label !== "Heating" && label !== "Cooking") return false;
    return grill.grillTemp >= stageDef.grillTemp - 15;
  }
  // timer: elapsed counts up to the hold start while a hold is in force.
  const effectiveEndMs = sess.holdStartedAt ? sess.holdStartedAt.getTime() : nowMs;
  return effectiveEndMs - sess.stageStartedAt.getTime() >= stageDef.durationMinutes * 60_000;
}

export function autoAdvanceReason(stageDef: StageDef, grill: { probeTemp: number; grillTemp: number }): string {
  if (stageDef.completion === "probe") return `probe reached ${grill.probeTemp}°F (target ${stageDef.probeTarget}°F)`;
  if (stageDef.completion === "grilltemp") return `grill reached ${grill.grillTemp}°F (target ${stageDef.grillTemp}°F)`;
  return "timer ended";
}

// Shared advancement used by manual advance (owner stages only), the
// autoAdvanceStage action, and updateGrillState's snapshot-driven advance.
// Durably acks the finished stage's alarms, captures the new stage's start
// probe, and posts the stage messages (plus the auto-advance note).
async function performAdvance(
  ctx: Ctx,
  s: { id: number; meatId: string; currentStageIndex: number; alarmAckedKeys?: string },
  opts: { auto: boolean; reason?: string },
): Promise<{ completed: boolean }> {
  const db = ctx.db<typeof schema>();
  const program = PROGRAMS.find((p) => p.id === s.meatId);
  if (!program) throw new Error("Program not found");
  const finishedStage = program.stages[s.currentStageIndex]!;
  const nextIndex = s.currentStageIndex + 1;
  const now = new Date();
  const prevAcked = parseAckedKeys(s.alarmAckedKeys);
  for (const k of [`${s.currentStageIndex}-owner`, `${s.currentStageIndex}-expired`]) {
    if (!prevAcked.includes(k)) prevAcked.push(k);
  }
  const ackedJoined = prevAcked.join(",");
  if (opts.auto && opts.reason) {
    await addMessage(ctx, s.id, "system", `“${finishedStage.title}” complete — ${opts.reason}. Moving on automatically.`);
  }
  if (nextIndex >= program.stages.length) {
    await db.update(schema.cookSessions).set({ status: "completed", updatedAt: now, alarmAckedKeys: ackedJoined, holdStartedAt: null }).where(eq(schema.cookSessions.id, s.id));
    await addMessage(ctx, s.id, "alarm", `${program.name} is DONE. Cook complete — great work. Grill shutdown has been requested from Muse's side; confirm the grill is off and cooling.`);
    ctx.invalidateQueries();
    return { completed: true };
  }
  const gRowsAdv = await db.select().from(schema.grillState).limit(1);
  const advProbe = gRowsAdv[0]?.probeConnected === 1 ? gRowsAdv[0].probeTemp : null;
  await db.update(schema.cookSessions).set({ currentStageIndex: nextIndex, stageStartedAt: now, updatedAt: now, stageStartProbe: advProbe, alarmAckedKeys: ackedJoined, holdStartedAt: null }).where(eq(schema.cookSessions.id, s.id));
  const stage = program.stages[nextIndex]!;
  await addMessage(ctx, s.id, "Muse", `Stage ${nextIndex + 1} of ${program.stages.length}: ${stage.title}. ${stage.claudeDoes}`);
  if (stage.ownerAction && stage.ownerDoes) {
    await addMessage(ctx, s.id, "alarm", `Your turn: ${stage.ownerDoes}`);
  }
  ctx.invalidateQueries();
  return { completed: false };
}

// When fresh grill data lands, a monitored stage whose condition is now
// satisfied advances on the spot — even with the app closed — so the cook
// is already on the right stage (and the next owner alarm armed) on open.
// Cascades through consecutive already-satisfied monitored stages (max 5).
async function attemptAutoAdvanceOnSnapshot(ctx: Ctx): Promise<void> {
  const db = ctx.db<typeof schema>();
  for (let i = 0; i < 5; i++) {
    const sessions = await db.select().from(schema.cookSessions).orderBy(desc(schema.cookSessions.id)).limit(5);
    const s = sessions.find((x) => x.status === "active");
    if (!s) return;
    const program = PROGRAMS.find((p) => p.id === s.meatId);
    const stageDef = program?.stages[s.currentStageIndex];
    if (!program || !stageDef || stageDef.completion === "owner") return;
    const gRows = await db.select().from(schema.grillState).limit(1);
    const g = gRows[0];
    if (!g) return;
    const grillLike = {
      probeConnected: g.probeConnected === 1, probeTemp: g.probeTemp, grillTemp: g.grillTemp,
      setpoint: g.setpoint, systemStatus: (g as { systemStatus?: number }).systemStatus ?? 99,
      cookIdPresent: ((g as { cookIdPresent?: number }).cookIdPresent ?? 0) === 1,
    };
    if (!computeStageConditionMet(stageDef, grillLike, s, Date.now())) return;
    await performAdvance(ctx, s, { auto: true, reason: autoAdvanceReason(stageDef, grillLike) });
  }
}

type TrendDir = "rising" | "falling" | "steady";
type TrendTone = "green" | "red" | "grey";
type TrendVal = { direction: TrendDir; tone: TrendTone; series: number[]; reference: number | null; windowMinutes: number } | null;
export function downsampleSeries(values: number[], maxPoints = 40): number[] {
  if (values.length <= maxPoints) return [...values];
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(values[Math.round((i * (values.length - 1)) / (maxPoints - 1))]!);
  return out;
}

function dirFromDelta(delta: number): TrendDir {
  // Owner's stability band: |Δ| ≤ 3°F over the window counts as "steady"
  // (flat arrow) — small drifts are not movement.
  if (delta > 3) return "rising";
  if (delta < -3) return "falling";
  return "steady";
}

// Trend arrows + sparklines over the real snapshot history (the ~2h
// store: real pushes plus typed carry-forward feeder rows — never
// interpolated or invented points). Window selection: prefer the last
// 30 minutes; when that window holds fewer than 2 usable points (≥2
// points spanning ≥3 minutes), widen to 60 minutes, then the full store.
// Trends are null ONLY when the whole store lacks 2 usable points, so
// sparse-but-real history still renders. Probe direction is the
// first→last delta over the chosen window with the owner's stability
// band (|Δ| ≤ 3°F = "steady", flat arrow); grill direction is the
// RECENT segment's delta (v27, see assessGrillTrend). Tone is judged
// against the active stage + grill state by the R7 semantics below. No
// recipe context → grey.
// ---- R7 trend-tone semantics (owner's rules, Nov 7 2026; grill rule
// amended v27) ----
// Direction comes from dirFromDelta (|Δ| ≤ 3°F = steady, flat arrow).
// Tone then judges that direction against context — "keep it flat,
// green if it's almost stable; all unexpected arrows are red":
// - GRILL while cooking with a setpoint (v27 amendment): the CURRENT
//   value's distance from the setpoint governs FIRST — inside the ±15°F
//   band the arrow is flat and the tone green, whatever wiggles happened
//   inside the band. Only OUTSIDE the band does direction matter, and
//   the direction judged is the RECENT movement (the window's last
//   segment), not the whole window's net change: moving TOWARD the
//   setpoint → green, with the arrow pointing the way the grill is
//   actually travelling (falling back down toward the setpoint from
//   above after a lid-open dip + overshoot is a green DOWN arrow — the
//   expected recovery); moving AWAY (rising further above, falling
//   further below) → red; steady while far outside the band → red flat.
//   (The v26 bug: a post-wrap window netted +10°F so 257°F vs a 250°F
//   setpoint painted a red up arrow even though the grill was inside
//   the band and settling down toward the setpoint.)
// - PROBE during a cook stage: rising → green; steady (a stall) → green;
//   falling → red. During a Rest stage the expectation inverts: falling
//   → green, steady → green, rising → red.
// - No cook context → grey.
export function grillTrendTone(direction: TrendDir, currentGrillTemp: number, setpoint: number): TrendTone {
  const dist = currentGrillTemp - setpoint;
  if (direction === "steady") return Math.abs(dist) <= 15 ? "green" : "red";
  if (direction === "rising") return dist < 0 ? "green" : "red";
  return dist > 0 ? "green" : "red";
}
// Canonical grill trend assessment (R7 v27; guarded by T69). Input is
// the RECENT segment's direction (last third of the window's points).
// Band first: |current − setpoint| ≤ 15°F → flat + green regardless of
// the recent wiggle. Outside the band the arrow keeps the direction of
// travel and the tone judges toward (green) vs away (red) via
// grillTrendTone; steady outside the band → red flat.
export function assessGrillTrend(recentDirection: TrendDir, currentGrillTemp: number, setpoint: number): { direction: TrendDir; tone: TrendTone } {
  if (Math.abs(currentGrillTemp - setpoint) <= 15) return { direction: "steady", tone: "green" };
  return { direction: recentDirection, tone: grillTrendTone(recentDirection, currentGrillTemp, setpoint) };
}
export function probeTrendTone(direction: TrendDir, isRest: boolean): TrendTone {
  if (isRest) return direction === "rising" ? "red" : "green";
  return direction === "falling" ? "red" : "green";
}

export function computeTrends(
  allSnapsAsc: { capturedAtMs: number; grillTemp: number; probeTemp: number }[],
  label: string,
  stageDef: StageDef | null,
  setpoint: number,
  currentGrillTemp: number,
  hasActiveCook: boolean,
  nowMs: number,
): { grill: TrendVal; probe: TrendVal } {
  let chosen: { capturedAtMs: number; grillTemp: number; probeTemp: number }[] = [];
  let chosenWindow = 120;
  for (const w of [30, 60, 120]) {
    const inW = allSnapsAsc.filter((s) => nowMs - s.capturedAtMs <= w * 60_000);
    if (inW.length >= 2 && inW[inW.length - 1]!.capturedAtMs - inW[0]!.capturedAtMs >= 3 * 60_000) { chosen = inW; chosenWindow = w; break; }
  }
  if (chosen.length < 2) return { grill: null, probe: null };
  const first = chosen[0]!;
  const last = chosen[chosen.length - 1]!;
  const grillSeries = downsampleSeries(chosen.map((s) => s.grillTemp));
  const probeSeries = downsampleSeries(chosen.map((s) => s.probeTemp));
  // Grill direction (v27): the RECENT movement — the last third of the
  // window's points (at least the last 2) — not the whole window's net
  // delta, so a lid-open dip + overshoot early in the window can't paint
  // the arrow for a grill that is now settling toward its setpoint.
  const grillSegStart = Math.max(0, chosen.length - Math.max(2, Math.ceil(chosen.length / 3)));
  const grillRecentDir = dirFromDelta(last.grillTemp - chosen[grillSegStart]!.grillTemp);
  let grillDir: TrendDir = grillRecentDir;
  const probeDir = dirFromDelta(last.probeTemp - first.probeTemp);
  const noContext = !stageDef || label === "Idle" || label === "Offline";
  let grillTone: TrendTone = "grey";
  if (!noContext) {
    if (label === "Igniting") {
      grillTone = grillDir === "rising" ? "green" : grillDir === "falling" ? "red" : "grey";
    } else if (label === "Heating" || label === "Cooking") {
      // Band-first assessment: inside ±15°F of the setpoint the arrow
      // goes flat + green; outside it, the recent direction is judged.
      const assessed = assessGrillTrend(grillRecentDir, currentGrillTemp, setpoint);
      grillDir = assessed.direction;
      grillTone = assessed.tone;
    }
  }
  let probeTone: TrendTone = "grey";
  if (!noContext && stageDef) {
    const isRest = stageDef.title.toLowerCase().includes("rest");
    if (isRest || stageDef.probeTarget != null) {
      probeTone = probeTrendTone(probeDir, isRest);
    }
  }
  const grillRef = hasActiveCook && (label === "Cooking" || label === "Heating" || label === "Igniting") ? setpoint : null;
  const probeRef = hasActiveCook && stageDef?.probeTarget != null ? stageDef.probeTarget : null;
  return {
    grill: { direction: grillDir, tone: grillTone, series: grillSeries, reference: grillRef, windowMinutes: chosenWindow },
    probe: { direction: probeDir, tone: probeTone, series: probeSeries, reference: probeRef, windowMinutes: chosenWindow },
  };
}

// Dynamic time-left for probe-completion stages, computed from the
// probe's ACTUAL rise rate in the real snapshot history (the same store
// trends uses — real pushes plus typed carry-forward rows carrying the
// last measured temps; never invented points).
// CURRENT-STAGE ONLY (v27): the window floor is the active stage's
// start — only snapshots at/after stageStartedAt count, and the stored
// stage-start probe reading (stageStartProbe) is the window's natural
// first point. Readings from earlier stages NEVER count: the v26 bug
// mixed fast pre-wrap readings into the wrapped stage's window and
// produced a physically impossible "24 min left" for a 47°F gap.
// Basis: the trailing 10-minute window, widening to 20 then 30 minutes
// when a narrower window lacks 2 usable in-stage points (span ≥2 min).
// The first window (narrowest first) with a positive rate wins; the
// rate is sanity-clamped to ≤1.5°F/min (a plausible low-and-slow band)
// in addition to the spike clamp below. If every usable window's rate
// is ≤0 the probe is stalled — state "stall", NO numeric countdown (a
// stall is normal in long cooks, never an error). If no window has 2
// usable in-stage points spanning ≥2 min yet, state "learning" — the
// estimate honestly shows it is still learning this stage's pace
// instead of inventing a number. The spike-clamp case (computed left
// under 2 minutes while >15°F remain — probe just repositioned) keeps
// state "fallback" with the nominal stage-timing estimate.
// asOf: ISO timestamp of the newest snapshot that fed the estimate
// (null when no snapshot did) — the client anchors its live tick-down
// countdown to it (see tickDownEstimateSeconds).
export type ProbeEstimate = { state: "dynamic" | "stall" | "fallback" | "learning"; ratePerMin: number | null; timeLeftSeconds: number | null; windowMinutes: number | null; probeTemp: number | null; asOf: string | null };
export const MAX_PROBE_RATE_PER_MIN = 1.5;
export function computeProbeEstimate(
  allSnapsAsc: { capturedAtMs: number; probeTemp: number }[],
  probeTarget: number,
  currentProbeTemp: number,
  stageStartedAtMs: number,
  stageStartProbe: number | null,
  holdStartedAtMs: number | null,
  durationMinutes: number,
  nowMs: number,
): ProbeEstimate {
  const remainingDeg = probeTarget - currentProbeTemp;
  const nominalLeftSec = Math.max(0, Math.round((durationMinutes * 60_000 - ((holdStartedAtMs ?? nowMs) - stageStartedAtMs)) / 1000));
  // In-stage series: snapshots at/after the stage start only, with the
  // stage-start probe reading as the natural first point.
  const inStage = allSnapsAsc.filter((s) => s.capturedAtMs >= stageStartedAtMs);
  if (stageStartProbe != null && !inStage.some((s) => s.capturedAtMs === stageStartedAtMs)) {
    inStage.unshift({ capturedAtMs: stageStartedAtMs, probeTemp: stageStartProbe });
  }
  const newestInStage = inStage[inStage.length - 1] ?? null;
  const asOf = newestInStage ? new Date(newestInStage.capturedAtMs).toISOString() : null;
  const fallback: ProbeEstimate = { state: "fallback", ratePerMin: null, timeLeftSeconds: nominalLeftSec, windowMinutes: null, probeTemp: currentProbeTemp, asOf };
  if (remainingDeg <= 0) return { state: "dynamic", ratePerMin: null, timeLeftSeconds: 0, windowMinutes: null, probeTemp: currentProbeTemp, asOf };
  let sawUsableWindow = false;
  for (const w of [10, 20, 30]) {
    const pts = inStage.filter((s) => nowMs - s.capturedAtMs <= w * 60_000);
    if (pts.length < 2) continue;
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const spanMin = (last.capturedAtMs - first.capturedAtMs) / 60_000;
    if (spanMin < 2) continue;
    sawUsableWindow = true;
    const rawRate = (last.probeTemp - first.probeTemp) / spanMin;
    if (rawRate <= 0) continue;
    const rate = Math.min(rawRate, MAX_PROBE_RATE_PER_MIN);
    const leftSec = Math.round((remainingDeg / rate) * 60);
    if (leftSec < 120 && remainingDeg > 15) return fallback;
    return { state: "dynamic", ratePerMin: Math.round(rate * 100) / 100, timeLeftSeconds: leftSec, windowMinutes: w, probeTemp: currentProbeTemp, asOf: new Date(last.capturedAtMs).toISOString() };
  }
  if (sawUsableWindow) return { state: "stall", ratePerMin: 0, timeLeftSeconds: null, windowMinutes: null, probeTemp: currentProbeTemp, asOf };
  return { state: "learning", ratePerMin: null, timeLeftSeconds: null, windowMinutes: null, probeTemp: currentProbeTemp, asOf };
}

export async function loadDashboard(ctx: Ctx): Promise<Dashboard> {
  await ensureSeed(ctx);
  const db = ctx.db<typeof schema>();
  const grillRows = await db.select().from(schema.grillState).limit(1);
  const g = grillRows[0]!;
  const sessions = await db.select().from(schema.cookSessions).orderBy(desc(schema.cookSessions.id)).limit(20);
  const active = sessions.find((s) => s.status === "active" || s.status === "shutdown_requested") ?? null;
  // Durable alarm acks + reality auto-ack: if the current stage's owner
  // start-action is evidently already done (snapshot proves it), mark its
  // alarm acknowledged server-side so it never replays on app open.
  let activeAckedKeys: string[] = active ? parseAckedKeys((active as { alarmAckedKeys?: string }).alarmAckedKeys) : [];
  let activeStageStartProbe: number | null = active ? ((active as { stageStartProbe?: number | null }).stageStartProbe ?? null) : null;
  if (active) {
    const gRow = grillRows[0]!;
    const program = PROGRAMS.find((p) => p.id === active.meatId);
    const stageDef = program?.stages[active.currentStageIndex];
    const ownerKey = `${active.currentStageIndex}-owner`;
    const patch: Record<string, unknown> = {};
    if (stageDef && !activeAckedKeys.includes(ownerKey) && stageActionEvidentlyDone(
      stageDef,
      { probeConnected: gRow.probeConnected === 1, probeTemp: gRow.probeTemp, systemStatus: (gRow as { systemStatus?: number }).systemStatus ?? 99, grillTemp: gRow.grillTemp, setpoint: gRow.setpoint, cookIdPresent: ((gRow as { cookIdPresent?: number }).cookIdPresent ?? 0) === 1 },
      active.stageStartedAt.getTime(),
      activeStageStartProbe,
      Date.now(),
    )) {
      activeAckedKeys = [...activeAckedKeys, ownerKey];
      patch.alarmAckedKeys = activeAckedKeys.join(",");
    }
    // Backfill the stage-start probe for a stage that only just began before
    // this tracking existed, so probe progress has a real baseline.
    if (activeStageStartProbe == null && stageDef?.probeTarget != null && Date.now() - active.stageStartedAt.getTime() < 5 * 60_000 && gRow.probeConnected === 1) {
      activeStageStartProbe = gRow.probeTemp;
      patch.stageStartProbe = gRow.probeTemp;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(schema.cookSessions).set(patch as never).where(eq(schema.cookSessions.id, active.id));
    }
  }
  const msgs = await db.select().from(schema.cookMessages).orderBy(desc(schema.cookMessages.id)).limit(40);
  let activeCorrection: Dashboard["activeCorrection"] = null;
  if (active) {
    const corrRows = await db.select().from(schema.setpointCorrections)
      .where(eq(schema.setpointCorrections.sessionId, active.id))
      .orderBy(desc(schema.setpointCorrections.id)).limit(1);
    const c = corrRows[0];
    if (c) {
      activeCorrection = {
        id: c.id, sessionId: c.sessionId, stageIndex: c.stageIndex,
        fromTemp: c.fromTemp, toTemp: c.toTemp, status: c.status,
        createdAt: c.createdAt.toISOString(),
      };
    }
  }
  const snapRows = await db.select().from(schema.grillSnapshots).orderBy(desc(schema.grillSnapshots.id)).limit(300);
  const trendNowMs = Date.now();
  // The whole ~2h store feeds computeTrends, which picks the display
  // window (30 → 60 → 120 min) itself; rows older than 2h are pruned on
  // append, and the filter here keeps that contract explicit.
  const allSnapsAsc = snapRows
    .filter((r) => trendNowMs - r.capturedAt.getTime() <= 2 * 60 * 60_000)
    .map((r) => ({ capturedAtMs: r.capturedAt.getTime(), grillTemp: r.grillTemp, probeTemp: r.probeTemp }))
    .sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  const trendLabel = deriveSystemStateLabel((g as { systemStatus?: number }).systemStatus ?? 99, ((g as { cookIdPresent?: number }).cookIdPresent ?? 0) === 1, g.grillTemp, g.setpoint);
  const trendStageDef = active ? (PROGRAMS.find((p) => p.id === active.meatId)?.stages[active.currentStageIndex] ?? null) : null;
  const trends = computeTrends(allSnapsAsc, trendLabel, trendStageDef, g.setpoint, g.grillTemp, Boolean(active), trendNowMs);
  const probeEstimate: ProbeEstimate | null = active && trendStageDef?.completion === "probe" && trendStageDef.probeTarget != null
    ? computeProbeEstimate(allSnapsAsc, trendStageDef.probeTarget, g.probeTemp, active.stageStartedAt.getTime(), activeStageStartProbe, active.holdStartedAt ? active.holdStartedAt.getTime() : null, trendStageDef.durationMinutes, trendNowMs)
    : null;
  const stageConditionMet = active && trendStageDef
    ? computeStageConditionMet(
        trendStageDef,
        { probeConnected: g.probeConnected === 1, probeTemp: g.probeTemp, grillTemp: g.grillTemp, setpoint: g.setpoint, systemStatus: (g as { systemStatus?: number }).systemStatus ?? 99, cookIdPresent: ((g as { cookIdPresent?: number }).cookIdPresent ?? 0) === 1 },
        active,
        trendNowMs,
      )
    : false;
  const authRows = await db.select().from(schema.traegerAuth).limit(1);
  const authRow = authRows[0];
  const testRuns = await loadTestRunsSummary(ctx);
  // R12 appInfo: build identity stamped into this build (constants above)
  // + the suite's latest status from testRuns. The light payload does NOT
  // carry appInfo — History loads the full dashboard as always.
  const appInfo: AppInfo = {
    versionLabel: APP_VERSION_LABEL,
    buildId: BUILD_ID,
    builtAtISO: APP_BUILT_AT_ISO,
    testsPassed: testRuns.passed,
    testsTotal: testRuns.total,
    testsLastRunAtISO: testRuns.lastRunAt,
    releases: LATEST_RELEASES,
  };
  const traegerAuth = {
    signedIn: Boolean(authRow),
    email: authRow ? authRow.email : null,
    tokenExpiresAt: authRow?.expiresAt ? authRow.expiresAt.toISOString() : null,
    tokenValid: Boolean(authRow?.idToken && authRow.expiresAt && authRow.expiresAt.getTime() > trendNowMs),
  };
  return {
    trends,
    probeEstimate,
    traegerAuth,
    stageConditionMet,
    grill: {
      name: g.name, model: g.model, firmware: g.firmware, connected: g.connected === 1,
      lastReportAt: g.lastReportAt, lastVerifiedAt: g.lastVerifiedAt,
      grillTemp: g.grillTemp, ambientTemp: g.ambientTemp, probeTemp: g.probeTemp, probeConnected: g.probeConnected === 1,
      setpoint: g.setpoint, superSmoke: g.superSmoke === 1, keepWarm: g.keepWarm === 1,
      wifiNetwork: g.wifiNetwork, wifiSignal: g.wifiSignal, pelletSensorConnected: g.pelletSensorConnected === 1,
      cookCycles: g.cookCycles, customCookName: g.customCookName, customCookGrillTemp: g.customCookGrillTemp, customCookProbeTemp: g.customCookProbeTemp,
      systemStatus: (g as { systemStatus?: number }).systemStatus ?? 99,
      systemStateLabel: (g as { systemStateLabel?: string }).systemStateLabel ?? deriveSystemStateLabel((g as { systemStatus?: number }).systemStatus ?? 99, ((g as { cookIdPresent?: number }).cookIdPresent ?? 0) === 1, g.grillTemp, g.setpoint),
      cookIdPresent: ((g as { cookIdPresent?: number }).cookIdPresent ?? 0) === 1,
    },
    programs: PROGRAMS,
    appInfo,
    history: TRAEGER_HISTORY,
    activeSession: active ? {
      id: active.id, meatId: active.meatId, meatName: active.meatName, status: active.status,
      currentStageIndex: active.currentStageIndex, stageStartedAt: active.stageStartedAt.toISOString(), createdAt: active.createdAt.toISOString(),
      holdStartedAt: active.holdStartedAt ? active.holdStartedAt.toISOString() : null,
      stageStartProbe: activeStageStartProbe,
      alarmAckedKeys: activeAckedKeys,
    } : null,
    messages: msgs.reverse().map((m) => ({ id: m.id, sessionId: m.sessionId, kind: m.kind, text: m.text, createdAt: m.createdAt.toISOString() })),
    lastSelectedMeatId: (() => {
      const raw = (g as { lastSelectedMeatId?: string | null }).lastSelectedMeatId ?? null;
      if (raw && PROGRAMS.some((p) => p.id === raw)) return raw;
      return "chuckroast";
    })(),
    activeCorrection,
    testRuns,
    stageView: active
      ? computeStageView(PROGRAMS.find((p) => p.id === active.meatId) ?? PROGRAMS[0]!, active.currentStageIndex, activeAckedKeys)
      : [],
  };
}

async function addMessage(ctx: Ctx, sessionId: number | null, kind: "system" | "Muse" | "owner" | "alarm" | "shutdown", text: string) {
  const db = ctx.db<typeof schema>();
  await db.insert(schema.cookMessages).values({ sessionId, kind, text });
}

export type GrillUpdateArgs = {
  connected?: boolean; grillTemp?: number; ambientTemp?: number; probeTemp?: number; probeConnected?: boolean;
  setpoint?: number; superSmoke?: boolean; keepWarm?: boolean; lastReportAt?: string; lastVerifiedAt?: string;
  systemStatus?: number; systemStateLabel?: string; cookIdPresent?: boolean;
};

// The one path every grill-state write flows through — Muse's manual
// pushes and the self-service liveRefresh alike: range enforcement,
// snapshot update, setpoint-correction confirmation, history append,
// and stage auto-advance checks.
export async function applyGrillUpdate(ctx: Ctx, args: GrillUpdateArgs): Promise<{ ok: true }> {
  // R8 range enforcement: this grill's setpoint range is 165–500°F.
  if (args.setpoint !== undefined && (args.setpoint < 165 || args.setpoint > 500)) {
    throw new Error(`Setpoint ${args.setpoint}°F is out of range — the grill accepts 165–500°F.`);
  }
  await ensureSeed(ctx);
  const db = ctx.db<typeof schema>();
  const existingRows = await db.select().from(schema.grillState).limit(1);
  const existing = existingRows[0];
  const patch: Record<string, unknown> = {};
  if (args.connected !== undefined) patch.connected = args.connected ? 1 : 0;
  if (args.grillTemp !== undefined) patch.grillTemp = args.grillTemp;
  if (args.ambientTemp !== undefined) patch.ambientTemp = args.ambientTemp;
  if (args.probeTemp !== undefined) patch.probeTemp = args.probeTemp;
  if (args.probeConnected !== undefined) patch.probeConnected = args.probeConnected ? 1 : 0;
  if (args.setpoint !== undefined) patch.setpoint = args.setpoint;
  if (args.superSmoke !== undefined) patch.superSmoke = args.superSmoke ? 1 : 0;
  if (args.keepWarm !== undefined) patch.keepWarm = args.keepWarm ? 1 : 0;
  if (args.lastReportAt !== undefined) patch.lastReportAt = args.lastReportAt;
  if (args.lastVerifiedAt !== undefined) patch.lastVerifiedAt = args.lastVerifiedAt;
  if (args.systemStatus !== undefined) patch.systemStatus = args.systemStatus;
  if (args.cookIdPresent !== undefined) patch.cookIdPresent = args.cookIdPresent ? 1 : 0;
  // Always keep raw code stored and label in sync: use caller label if
  // supplied, otherwise derive from the effective (new or existing) values.
  const effStatus = args.systemStatus ?? (existing as { systemStatus?: number } | undefined)?.systemStatus ?? 99;
  const effCook = args.cookIdPresent ?? (((existing as { cookIdPresent?: number } | undefined)?.cookIdPresent ?? 0) === 1);
  const effGrillTemp = args.grillTemp ?? existing?.grillTemp ?? 0;
  const effSetpoint = args.setpoint ?? existing?.setpoint ?? 0;
  if (args.systemStateLabel !== undefined) {
    patch.systemStateLabel = args.systemStateLabel;
  } else if (args.systemStatus !== undefined || args.cookIdPresent !== undefined || args.grillTemp !== undefined || args.setpoint !== undefined || args.connected !== undefined) {
    // If caller says offline via connected=false and no explicit code, map to 99.
    const statusForLabel = args.connected === false && args.systemStatus === undefined ? 99 : effStatus;
    if (args.connected === false && args.systemStatus === undefined) patch.systemStatus = 99;
    patch.systemStateLabel = deriveSystemStateLabel(statusForLabel, effCook, effGrillTemp, effSetpoint);
  }
  if (Object.keys(patch).length > 0) {
    await db.update(schema.grillState).set(patch as never).where(eq(schema.grillState.id, 1));
  }
  // Auto-fix confirmation: when a pushed snapshot's setpoint matches an
  // outstanding correction's target, mark it confirmed and note it in the
  // cook feed — the grill now follows the recipe.
  {
    const outstanding = await db.select().from(schema.setpointCorrections)
      .where(eq(schema.setpointCorrections.status, "requested"));
    for (const c of outstanding) {
      if (c.toTemp !== effSetpoint) continue;
      const sRows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, c.sessionId)).limit(1);
      const sess = sRows[0];
      if (!sess || (sess.status !== "active" && sess.status !== "shutdown_requested")) continue;
      await db.update(schema.setpointCorrections)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(eq(schema.setpointCorrections.id, c.id));
      await addMessage(ctx, c.sessionId, "Muse", `Grill now follows the recipe: ${c.toTemp}°F ✓`);
    }
  }
  // Append this snapshot to the trend history (last ~2 hours kept) so
  // getDashboard can compute Grill/Probe trends over the history store.
  {
    const curRows = await db.select().from(schema.grillState).limit(1);
    const cur = curRows[0];
    if (cur) {
      await db.insert(schema.grillSnapshots).values({
        capturedAt: new Date(),
        grillTemp: cur.grillTemp, probeTemp: cur.probeTemp,
        setpoint: cur.setpoint, systemStatus: (cur as { systemStatus?: number }).systemStatus ?? 99,
      });
      await db.delete(schema.grillSnapshots).where(lt(schema.grillSnapshots.capturedAt, new Date(Date.now() - 2 * 60 * 60_000)));
    }
  }
  // Fresh data may satisfy the active monitored stage's condition
  // (probe hit target, grill reached preheat temp) — advance on the
  // spot so the session follows the grill, not a button.
  try { await attemptAutoAdvanceOnSnapshot(ctx); } catch { /* snapshot itself is saved either way */ }
  ctx.invalidateQueries();
  return { ok: true };
}

// ---- Self-service live refresh machinery ----
// The refresh button's own path to Traeger, no human in the loop: cached
// 24h token (auto-renewed from the stored login when expired) → signed
// MQTT URL → MQTT-over-WSS subscription → command "90" → the grill's
// fresh status payload → applyGrillUpdate (the same write path as a
// manual push). Rate discipline is a canonical pure gate (guarded by
// T37): concurrent taps join the in-flight call; live calls are at least
// 15s apart. All network errors surface as honest statuses, never throws.
export const LIVE_REFRESH_MIN_INTERVAL_MS = 15_000;
export function resolveLiveRefreshGate(input: { nowMs: number; lastAttemptMs: number | null; inFlight: boolean }): "proceed" | "join" | "wait" {
  if (input.inFlight) return "join";
  if (input.lastAttemptMs != null && input.nowMs - input.lastAttemptMs < LIVE_REFRESH_MIN_INTERVAL_MS) return "wait";
  return "proceed";
}

// ---- Auto-refetch cycle (R6 amendment, v28) ----
// WHY THIS EXISTS: the client's only automatic cycle used to be the 10s
// LIGHT poll, which re-reads the STORED snapshot — it can never advance
// lastVerifiedAt. The live pull ran only on a manual tap (or when an
// outside monitor pushed a snapshot), so an open app with no outside
// pushes sat on stale data indefinitely while looking alive — the
// owner's Nov 7 report: screen awake, data 6+ minutes stale, manual tap
// instantly fresh. The fix is a client scheduler driven by this ONE
// canonical decision (mirrored in App.tsx; guarded by T70–T73):
// while the app is open and VISIBLE with an active session, fire the
// live refresh on a ~60s cadence; pause while hidden; on return to the
// foreground fire promptly (gate-aware) and resume the cadence. The
// decision is pure and total — every input combination has exactly one
// answer, in-flight always wins (a manual tap during an auto cycle, or
// an auto tick during a manual call, joins the server's single
// in-flight call instead of duplicating it), and the 15s gate is
// checked before any fire reason so attempts never land inside it.
// A failed attempt changes nothing here: lastAttemptMs records the
// ATTEMPT, so the next cadence tick fires on schedule regardless of the
// previous outcome — failure can never wedge the cycle (T73).
export const AUTO_REFRESH_CADENCE_MS = 60_000;
export type AutoRefreshReason = "cadence" | "foreground" | "hidden" | "no_active_session" | "in_flight" | "gate_wait" | "interval_wait";
export type AutoRefreshDecision = { fire: boolean; reason: AutoRefreshReason };
export function autoRefreshDecision(input: {
  nowMs: number;
  visible: boolean;
  hasActiveSession: boolean;
  inFlight: boolean;
  lastAttemptMs: number | null;
  foregroundAtMs: number | null;
}): AutoRefreshDecision {
  if (!input.visible) return { fire: false, reason: "hidden" };
  if (!input.hasActiveSession) return { fire: false, reason: "no_active_session" };
  if (input.inFlight) return { fire: false, reason: "in_flight" };
  const sinceAttemptMs = input.lastAttemptMs == null ? null : input.nowMs - input.lastAttemptMs;
  // A foregrounding that no attempt has answered yet fires promptly —
  // even mid-cadence — once the gate allows it. The gate check lives
  // INSIDE this branch: gate_wait means "a foreground fire is pending
  // but the 15s gate blocks it". Once the foreground fire is consumed
  // (an attempt at/after foregroundAtMs), the regime is the plain
  // cadence and a recent attempt reads interval_wait (T72).
  const foregroundPending = input.foregroundAtMs != null && (input.lastAttemptMs == null || input.lastAttemptMs < input.foregroundAtMs);
  if (foregroundPending) {
    if (sinceAttemptMs != null && sinceAttemptMs < LIVE_REFRESH_MIN_INTERVAL_MS) return { fire: false, reason: "gate_wait" };
    return { fire: true, reason: "foreground" };
  }
  if (sinceAttemptMs == null || sinceAttemptMs >= AUTO_REFRESH_CADENCE_MS) return { fire: true, reason: "cadence" };
  return { fire: false, reason: "interval_wait" };
}
let liveRefreshInFlight: Promise<LiveRefreshResult> | null = null;
let lastLiveRefreshAttemptMs: number | null = null;

const TRAEGER_AUTH_URL = "https://auth-api.iot.traegergrills.io/tokens";
const TRAEGER_API_BASE = "https://mobile-iot-api.iot.traegergrills.io";

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); } finally { clearTimeout(t); }
}

// Returns a usable idToken: the cached one when still valid (>60s of
// life left), otherwise a fresh one re-authenticated from the stored
// login (the password never leaves this server except in this one HTTPS
// POST to Traeger's auth endpoint). Errors are honest statuses.
async function acquireTraegerToken(ctx: Ctx): Promise<{ token: string; renewed: boolean } | { error: LiveRefreshCore }> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.traegerAuth).limit(1);
  const row = rows[0];
  if (!row) return { error: { ok: false, status: "signin_needed", message: "Traeger sign-in needed — sign in under Status & History.", verifiedAt: null } };
  if (row.idToken && row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000) return { token: row.idToken, renewed: false };
  if (!row.email || !row.password) return { error: { ok: false, status: "auth_failed", message: "Traeger sign-in failed — update the stored login under Status & History.", verifiedAt: null } };
  let res: Response;
  try {
    res = await fetchWithTimeout(TRAEGER_AUTH_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: row.email, password: row.password }) }, 10_000);
  } catch { return { error: { ok: false, status: "unreachable", message: "Couldn't reach Traeger's sign-in — try again in a moment.", verifiedAt: null } }; }
  if (!res.ok) return { error: { ok: false, status: "auth_failed", message: "Traeger sign-in failed — update the stored login under Status & History.", verifiedAt: null } };
  const data = (await res.json().catch(() => null)) as { idToken?: string; expiresIn?: number } | null;
  if (!data?.idToken) return { error: { ok: false, status: "auth_failed", message: "Traeger sign-in failed — update the stored login under Status & History.", verifiedAt: null } };
  const expiresAt = new Date(Date.now() + (typeof data.expiresIn === "number" && data.expiresIn > 0 ? data.expiresIn : 86_400) * 1000);
  await db.update(schema.traegerAuth).set({ idToken: data.idToken, expiresAt }).where(eq(schema.traegerAuth.id, row.id));
  return { token: data.idToken, renewed: true };
}

// Minimal MQTT 3.1.1 over WSS — just CONNECT / SUBSCRIBE / PUBLISH /
// PUBACK, enough to hear one status payload from the grill.
function mqttRemainingLength(n: number): number[] {
  const out: number[] = [];
  let v = n;
  do { let b = v % 128; v = Math.floor(v / 128); if (v > 0) b |= 0x80; out.push(b); } while (v > 0);
  return out;
}
function mqttUtf8Field(s: string): number[] {
  const b = Array.from(new TextEncoder().encode(s));
  return [Math.floor(b.length / 256), b.length % 256, ...b];
}
function mqttConnectPacket(clientId: string): Uint8Array {
  const body = [...mqttUtf8Field("MQTT"), 4, 0x02, 0, 60, ...mqttUtf8Field(clientId)];
  return new Uint8Array([0x10, ...mqttRemainingLength(body.length), ...body]);
}
function mqttSubscribePacket(topic: string): Uint8Array {
  const body = [0, 1, ...mqttUtf8Field(topic), 0];
  return new Uint8Array([0x82, ...mqttRemainingLength(body.length), ...body]);
}

// Defensively pull grill fields out of whatever shape the status payload
// uses (flat or nested under state.reported): collect scalar fields by
// lower-cased key, then map the known names. Only values inside sane
// ranges are accepted; anything unknown is left out (applyGrillUpdate
// merges partial updates), so nothing is ever fabricated.
export function extractGrillStatus(payload: unknown): { full: boolean; args: GrillUpdateArgs } {
  const flat: Record<string, unknown> = {};
  const walk = (node: unknown, depth: number): void => {
    if (depth > 4 || node == null || typeof node !== "object" || Array.isArray(node)) return;
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (!(key in flat) && (typeof v === "number" || typeof v === "boolean" || typeof v === "string")) flat[key] = v;
      if (typeof v === "object" && v !== null) walk(v, depth + 1);
    }
  };
  walk(payload, 0);
  const num = (keys: string[], min: number, max: number): number | undefined => {
    for (const k of keys) {
      const v = flat[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max) return Math.round(v);
    }
    return undefined;
  };
  const grillTemp = num(["grill", "grill_temp", "grilltemp", "grill_temperature"], 0, 650);
  const probeTemp = num(["probe", "probe_temp", "probetemp", "probe_temperature"], 0, 450);
  const ambientTemp = num(["ambient", "ambient_temp", "ambienttemp", "ambient_temperature"], -30, 300);
  const setpoint = num(["setpoint", "set_point", "settemp", "grill_setpoint"], 165, 500);
  const systemStatus = num(["system_status", "systemstatus", "sys_status"], 0, 999);
  const args: GrillUpdateArgs = {};
  if (grillTemp !== undefined) args.grillTemp = grillTemp;
  if (probeTemp !== undefined) args.probeTemp = probeTemp;
  if (ambientTemp !== undefined) args.ambientTemp = ambientTemp;
  if (setpoint !== undefined) args.setpoint = setpoint;
  if (systemStatus !== undefined) args.systemStatus = systemStatus;
  if ("cook_id" in flat) args.cookIdPresent = flat["cook_id"] != null && flat["cook_id"] !== "";
  const pc = flat["probe_connected"];
  if (typeof pc === "boolean") args.probeConnected = pc;
  else if (typeof pc === "number") args.probeConnected = pc !== 0;
  else if (probeTemp !== undefined) args.probeConnected = true;
  const full = systemStatus !== undefined || (grillTemp !== undefined && probeTemp !== undefined);
  return { full, args };
}

// Hard cap on the whole MQTT listen (connect + subscribe + wait for the
// first acceptable status). Typical completion is low single-digit
// seconds — the retained message or the grill's answer to command "90"
// arrives almost immediately; the cap exists only so a silent grill
// fails honestly (→ manual fallback) instead of hanging the tap.
export const LIVE_LISTEN_CAP_MS = 12_000;

// Retained-vs-live acceptance (R6; guarded by T49). The broker delivers
// the topic's RETAINED message the moment we subscribe — its RETAIN flag
// is set; every later live publish to our established subscription
// arrives with RETAIN cleared. A live publish is always accepted (it is
// the grill answering NOW). A retained payload is accepted only when it
// carries data newer than the stored snapshot (some key field differs);
// a retained payload identical to the stored snapshot proves nothing
// about the grill's current state, so we keep waiting for the post-"90"
// live publish within the same cap.
export function classifyStatusPayload(input: { retained: boolean; identicalToStored: boolean }): "accept" | "wait" {
  if (!input.retained) return "accept";
  return input.identicalToStored ? "wait" : "accept";
}
type StoredStatusLike = { grillTemp: number; probeTemp: number; setpoint: number; systemStatus: number };
function payloadMatchesStored(args: GrillUpdateArgs, stored: StoredStatusLike | null): boolean {
  if (!stored) return false;
  if (args.grillTemp === undefined || args.probeTemp === undefined) return false;
  if (args.grillTemp !== stored.grillTemp || args.probeTemp !== stored.probeTemp) return false;
  if (args.setpoint !== undefined && args.setpoint !== stored.setpoint) return false;
  if (args.systemStatus !== undefined && args.systemStatus !== stored.systemStatus) return false;
  return true;
}

// ---- MQTT socket plumbing (R6) ----
// The server runtime's outbound traffic must go through its configured
// egress proxy: fetch honors the proxy env automatically, but a raw
// WebSocket connects directly — and the direct route to Traeger's
// broker cannot complete TLS, so the socket dies in ~10ms while the
// REST stages take ~0.5s. That signature (listenMs ≈ 10 recorded as a
// 12s "timeout", zero payloads, not even the retained message) is
// exactly how the v24 refresh bug presented. The socket is therefore
// opened through the proxy whenever one is configured. The proxy value
// is a credential-bearing URL that lives in the HOST environment:
// action code cannot read it directly, so performLiveRefresh fetches
// it through the privileged getEgressProxy call (server/src/privileged.ts)
// and hands it to the socket factory. It is never logged, stored, or
// returned to the client.
// Canonical proxy precedence (the privileged handler mirrors this —
// keep the two in sync):
export function resolveEgressProxy(env: Record<string, string | undefined>): string | null {
  for (const key of ["HTTPS_PROXY", "https_proxy", "ALL_PROXY", "all_proxy", "HTTP_PROXY", "http_proxy"]) {
    const v = env[key]?.trim();
    if (v) return v;
  }
  return null;
}

// The minimal socket surface the listen loop uses — the real WebSocket
// satisfies it structurally, and the guard suite injects scripted fakes.
export type MqttSocketLike = {
  binaryType: string;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void | Promise<void>) | null;
  onerror: ((ev: { message?: string }) => void) | null;
  onclose: ((ev: { code?: number }) => void) | null;
  send: (data: Uint8Array) => void;
  close: () => void;
};
export type MqttSocketFactory = (url: string) => MqttSocketLike;

// Test seams (R14): the guard suite replaces the socket factory, the
// signed-URL provider, the command sender, and the listen cap so the
// FULL liveRefresh path — timing record included — runs hermetically
// against a scripted fake broker. All null in production, where the
// real network path runs. The suite resets them after use.
export const liveRefreshTestSeams: {
  socketFactory: MqttSocketFactory | null;
  signedUrlProvider: ((token: string) => Promise<string | null>) | null;
  commandSender: ((thingName: string, token: string) => Promise<void>) | null;
  listenCapMs: number | null;
} = { socketFactory: null, signedUrlProvider: null, commandSender: null, listenCapMs: null };
export function resetLiveRefreshGateForTests(): void {
  lastLiveRefreshAttemptMs = null;
  liveRefreshInFlight = null;
}

function defaultMqttSocketFactory(url: string, proxy: string | null): MqttSocketLike {
  if (proxy) {
    const Ctor = WebSocket as unknown as new (u: string, opts: { protocols: string[]; proxy: string }) => WebSocket;
    return new Ctor(url, { protocols: ["mqtt"], proxy }) as unknown as MqttSocketLike;
  }
  return new WebSocket(url, "mqtt") as unknown as MqttSocketLike;
}

// What a failed listen means, honestly (R6): only a listen that was
// fully subscribed and then heard nothing for the whole window is a
// timeout ("the grill didn't answer"). A socket that dies before or
// during the subscription — or drops mid-listen — is a cloud-link
// failure (unreachable). Reporting those as a timeout, with a listenMs
// of ~10ms against a 12s window, was the v24 bug.
export type ListenFailureKind = "connect_failed" | "subscribe_failed" | "link_lost" | "silent";
export function listenFailureStatus(kind: ListenFailureKind): { status: "unreachable" | "timeout"; message: string } {
  if (kind === "silent") return { status: "timeout", message: "The grill didn't answer in time — it may be offline or asleep." };
  if (kind === "connect_failed") return { status: "unreachable", message: "Couldn't open the grill's cloud link — Traeger's broker didn't answer the connection." };
  if (kind === "subscribe_failed") return { status: "unreachable", message: "Traeger's cloud link opened, but the grill's channel never confirmed — try again in a moment." };
  return { status: "unreachable", message: "The grill's cloud link dropped while listening — try again in a moment." };
}

export type ListenResult =
  | { kind: "payload"; payload: unknown; source: "live" | "retained" }
  | { kind: ListenFailureKind; errorClass?: string };

// Sanitized socket error class (R6): Bun's WebSocket error messages
// embed the full URL — for a signed broker URL that is a credential
// and must NEVER reach the timing record, the client, or a log. Only
// a coarse class token is extracted: an HTTP status (http_NNN — the
// broker/proxy answered the upgrade with that status), a TLS failure,
// a proxy failure, a timeout, a refusal, a DNS failure, or a generic
// socket_error. Guarded by T65.
export function classifySocketError(message: string | undefined): string {
  if (!message) return "socket_error";
  const m = message.match(/Expected 101 status code: (\d{3})/);
  if (m) return `http_${m[1]}`;
  const lower = message.toLowerCase();
  if (lower.includes("tls") || lower.includes("ssl") || lower.includes("certificate")) return "tls_handshake";
  if (lower.includes("proxy")) return "proxy_error";
  if (lower.includes("timed out") || lower.includes("timeout")) return "timeout";
  if (lower.includes("refused")) return "conn_refused";
  if (lower.includes("getaddrinfo") || lower.includes("enotfound") || lower.includes("dns")) return "dns_error";
  return "socket_error";
}

// Connect to the signed WSS URL (through the egress proxy when one is
// configured — see above), subscribe to the grill's update topic, fire
// onSubscribed (the caller POSTs command "90" then), and resolve with
// the FIRST acceptable status payload (see classifyStatusPayload) —
// tearing the connection down the moment one lands, never sitting out
// the cap when a payload already arrived. Failures resolve with the
// stage the listen reached, never a bare null: how it died decides
// whether the refresh reports unreachable or an honest timeout.
function fetchStatusViaMqtt(signedUrl: string, thingName: string, onSubscribed: () => void, stored: StoredStatusLike | null, egressProxy?: string | null): Promise<ListenResult> {
  const topic = `prod/thing/update/${thingName}`;
  const capMs = liveRefreshTestSeams.listenCapMs ?? LIVE_LISTEN_CAP_MS;
  const factory = liveRefreshTestSeams.socketFactory ?? ((u: string) => defaultMqttSocketFactory(u, egressProxy ?? null));
  return new Promise((resolve) => {
    let ws: MqttSocketLike | null = null;
    let settled = false;
    let connacked = false;
    let subscribed = false;
    // Death by error/close: the stage reached decides the outcome.
    const dropKind = (): { kind: ListenFailureKind } => (subscribed ? { kind: "link_lost" } : connacked ? { kind: "subscribe_failed" } : { kind: "connect_failed" });
    // Death by the cap: a subscribed listen that heard nothing is the
    // one true timeout; anything earlier never got the channel open.
    const capKind = (): { kind: ListenFailureKind } => (subscribed ? { kind: "silent" } : connacked ? { kind: "subscribe_failed" } : { kind: "connect_failed" });
    const done = (v: ListenResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      try { ws?.close(); } catch { /* ignore */ }
      resolve(v);
    };
    const deadline = setTimeout(() => done(capKind()), capMs);
    try { ws = factory(signedUrl); } catch { clearTimeout(deadline); resolve({ kind: "connect_failed" }); return; }
    ws.binaryType = "arraybuffer";
    let buf: number[] = [];
    ws.onopen = () => {
      try { ws?.send(mqttConnectPacket(`cockpit-${Math.random().toString(36).slice(2, 12)}`)); } catch { done({ kind: "connect_failed" }); }
    };
    ws.onmessage = async (ev: { data: unknown }) => {
      try {
        const data = ev.data as ArrayBuffer | Blob | string;
        const bytes = typeof data === "string" ? Array.from(new TextEncoder().encode(data)) : Array.from(new Uint8Array(data instanceof ArrayBuffer ? data : await data.arrayBuffer()));
        buf.push(...bytes);
        for (;;) {
          if (buf.length < 2) return;
          let remLen = 0; let mult = 1; let idx = 1; let lenComplete = false;
          for (; idx < buf.length && idx <= 4; idx++) {
            const b = buf[idx]!;
            remLen += (b & 0x7f) * mult;
            mult *= 128;
            if ((b & 0x80) === 0) { lenComplete = true; idx++; break; }
          }
          if (!lenComplete) return;
          const total = idx + remLen;
          if (buf.length < total) return;
          const packet = buf.slice(0, total);
          buf = buf.slice(total);
          const type = (packet[0]! >> 4) & 0x0f;
          if (type === 2) {
            connacked = true;
            try { ws?.send(mqttSubscribePacket(topic)); } catch { done({ kind: "subscribe_failed" }); return; }
          } else if (type === 9) {
            if (!subscribed) { subscribed = true; try { onSubscribed(); } catch { /* command POST is best-effort */ } }
          } else if (type === 3) {
            const qos = (packet[0]! >> 1) & 0x03;
            let off = idx;
            const topicLen = (packet[off]! << 8) | packet[off + 1]!;
            off += 2 + topicLen;
            if (qos > 0) {
              const pid = (packet[off]! << 8) | packet[off + 1]!;
              off += 2;
              try { ws?.send(new Uint8Array([0x40, 2, Math.floor(pid / 256), pid % 256])); } catch { /* ignore */ }
            }
            const text = new TextDecoder().decode(new Uint8Array(packet.slice(off)));
            let json: unknown = null;
            try { json = JSON.parse(text); } catch { json = null; }
            if (json != null) {
              const extracted = extractGrillStatus(json);
              if (extracted.full) {
                // RETAIN flag (bit 0 of the fixed header): set on the
                // broker's subscription-time retained delivery, clear on
                // live publishes to our established subscription.
                const retained = (packet[0]! & 0x01) === 1;
                const verdict = classifyStatusPayload({ retained, identicalToStored: payloadMatchesStored(extracted.args, stored) });
                if (verdict === "accept") { done({ kind: "payload", payload: json, source: retained ? "retained" : "live" }); return; }
                // Retained + identical to what we already hold: not
                // proof of the grill's current state — keep waiting for
                // the live answer to command "90" within the same cap.
              }
            }
          }
        }
      } catch { /* malformed frame — keep listening until the deadline */ }
    };
    ws.onerror = (ev) => done({ ...dropKind(), errorClass: classifySocketError(ev?.message) });
    ws.onclose = () => { if (!settled) done(dropKind()); };
  });
}

async function performLiveRefresh(ctx: Ctx): Promise<LiveRefreshResult> {
  const t0 = Date.now();
  const marks: { tokenMs: number; tokenRenewed: boolean; mqttMs: number | null; listenMs: number | null; payloadSource: "live" | "retained" | null; listenOutcome: LiveRefreshTiming["listenOutcome"]; proxyMs: number; proxyPresent: boolean | null; failStage: LiveRefreshTiming["failStage"]; failErrorClass: string | null } = { tokenMs: 0, tokenRenewed: false, mqttMs: null, listenMs: null, payloadSource: null, listenOutcome: null, proxyMs: 0, proxyPresent: null, failStage: null, failErrorClass: null };
  const finish = (core: LiveRefreshCore): LiveRefreshResult => {
    const timing: LiveRefreshTiming = {
      at: new Date().toISOString(), outcome: core.status, totalMs: Date.now() - t0,
      tokenMs: marks.tokenMs, tokenRenewed: marks.tokenRenewed,
      mqttMs: marks.mqttMs, listenMs: marks.listenMs, payloadSource: marks.payloadSource,
      listenOutcome: marks.listenOutcome,
      proxyMs: marks.proxyMs, proxyPresent: marks.proxyPresent,
      failStage: marks.failStage, failErrorClass: marks.failErrorClass,
    };
    lastLiveRefreshTiming = timing;
    return { ...core, timing };
  };
  await ensureSeed(ctx);
  const tToken = Date.now();
  const acquired = await acquireTraegerToken(ctx);
  marks.tokenMs = Date.now() - tToken;
  if ("error" in acquired) return finish(acquired.error);
  marks.tokenRenewed = acquired.renewed;
  const token = acquired.token;
  const thingName = TRAEGER_HISTORY.identity.thingName;
  lastLiveRefreshAttemptMs = Date.now();
  let signedUrl: string | null = null;
  const tMqtt = Date.now();
  if (liveRefreshTestSeams.signedUrlProvider) {
    // Hermetic path (guard suite only): no real cloud call is made.
    try { signedUrl = await liveRefreshTestSeams.signedUrlProvider(token); } catch { signedUrl = null; }
    marks.mqttMs = Date.now() - tMqtt;
  } else {
    try {
      const res = await fetchWithTimeout(`${TRAEGER_API_BASE}/mqtt-connections`, { method: "POST", headers: { authorization: token, "content-type": "application/json" }, body: "{}" }, 8_000);
      marks.mqttMs = Date.now() - tMqtt;
      if (res.status === 401 || res.status === 403) return finish({ ok: false, status: "auth_failed", message: "Traeger rejected the saved sign-in — update the stored login under Status & History.", verifiedAt: null });
      if (!res.ok) return finish({ ok: false, status: "unreachable", message: `Traeger cloud answered HTTP ${res.status} — try again in a moment.`, verifiedAt: null });
      const data = (await res.json().catch(() => null)) as { signedUrl?: string } | null;
      signedUrl = data?.signedUrl ?? null;
    } catch { marks.mqttMs = Date.now() - tMqtt; return finish({ ok: false, status: "unreachable", message: "Couldn't reach Traeger's cloud — try again in a moment.", verifiedAt: null }); }
  }
  if (!signedUrl) return finish({ ok: false, status: "unreachable", message: "Traeger cloud didn't return a connection URL.", verifiedAt: null });
  // The stored snapshot the retained payload will be judged against.
  const db = ctx.db<typeof schema>();
  const gRows = await db.select().from(schema.grillState).limit(1);
  const gRow = gRows[0];
  const stored: StoredStatusLike | null = gRow ? { grillTemp: gRow.grillTemp, probeTemp: gRow.probeTemp, setpoint: gRow.setpoint, systemStatus: (gRow as { systemStatus?: number }).systemStatus ?? 99 } : null;
  // The MQTT socket must go through the runtime's egress proxy (see
  // the plumbing note above): fetch the proxy value from the host
  // environment via the privileged helper. Best-effort — a failure
  // leaves a direct socket, which is correct when no proxy is
  // configured at all. Skipped entirely when the guard suite has
  // seamed the socket factory (hermetic runs make no privileged call).
  // v26: the fetch is timed on its own (proxyMs) and its outcome
  // recorded (proxyPresent) — v25 folded both into listenMs, hiding
  // whether the value ever arrived in this process.
  let egressProxy: string | null = null;
  if (!liveRefreshTestSeams.socketFactory) {
    const tProxy = Date.now();
    let proxyCallFailed = false;
    try { egressProxy = (await ctx.executePrivileged(Privileged.getEgressProxy, {})).proxy; } catch { egressProxy = null; proxyCallFailed = true; }
    marks.proxyMs = Date.now() - tProxy;
    marks.proxyPresent = proxyCallFailed ? null : egressProxy != null;
  }
  const tListen = Date.now();
  const got = await fetchStatusViaMqtt(signedUrl, thingName, () => {
    if (liveRefreshTestSeams.commandSender) { void liveRefreshTestSeams.commandSender(thingName, token).catch(() => { /* best-effort */ }); return; }
    void fetchWithTimeout(`${TRAEGER_API_BASE}/things/${thingName}/commands`, { method: "POST", headers: { authorization: token, "content-type": "application/json" }, body: JSON.stringify({ command: "90" }) }, 8_000).catch(() => { /* the listen cap governs the outcome */ });
  }, stored, egressProxy);
  marks.listenMs = Date.now() - tListen;
  marks.listenOutcome = got.kind === "payload" ? "payload" : got.kind;
  // The worker socket's own error class is the first diagnostic
  // evidence (sanitized by classifySocketError — the raw message
  // embeds the signed URL and never leaves this function).
  if (got.kind !== "payload" && got.errorClass) marks.failErrorClass = got.errorClass;
  const failureKind: ListenFailureKind | null = got.kind === "payload" ? null : got.kind;
  let accepted: { payload: unknown; source: "live" | "retained" } | null = got.kind === "payload" ? { payload: got.payload, source: got.source } : null;
  if (!accepted) {
    // v26 stage diagnosis + privileged retry: when this worker's
    // socket dies before the subscription is up, ask the privileged
    // executor to walk the broker path stage by stage (proxy CONNECT
    // → TLS → WS upgrade) so the timing record names the exact
    // failing stage, sanitized. If every stage is healthy from the
    // privileged context, the fault is this worker's socket layer —
    // so retry the whole listen INSIDE the privileged executor, the
    // one context proven to reach Traeger's cloud, and judge its
    // payloads with the same acceptance rules as a local listen.
    // Real path only: any test seam disables all privileged calls.
    if ((got.kind === "connect_failed" || got.kind === "subscribe_failed") && !liveRefreshTestSeams.socketFactory && !liveRefreshTestSeams.signedUrlProvider) {
      let probe: BrokerProbe | null = null;
      try {
        const host = new URL(signedUrl).hostname;
        if (host) probe = await ctx.executePrivileged(Privileged.probeBrokerPath, { host, port: 443 });
      } catch { probe = null; }
      if (probe) marks.proxyPresent = probe.proxyPresent;
      const mapped = failStageFromProbe(probe);
      marks.failStage = mapped.failStage;
      // A real stage failure's class (from the privileged probe)
      // outranks the worker socket's class; a healthy probe's class
      // (the broker's answer to the UNSIGNED probe) only fills a gap.
      if (probe?.failStage) marks.failErrorClass = mapped.failErrorClass;
      else if (!marks.failErrorClass) marks.failErrorClass = mapped.failErrorClass;
      if (mapped.failStage === "worker_socket") {
        const tRetry = Date.now();
        try {
          const retry = await ctx.executePrivileged(Privileged.mqttListen, {
            signedUrl, thingName, token, apiBase: TRAEGER_API_BASE,
            capMs: liveRefreshTestSeams.listenCapMs ?? LIVE_LISTEN_CAP_MS,
          });
          marks.listenMs = (marks.listenMs ?? 0) + (Date.now() - tRetry);
          for (const cand of retry.payloads) {
            let json: unknown = null;
            try { json = JSON.parse(cand.json); } catch { json = null; }
            if (json == null) continue;
            const ex = extractGrillStatus(json);
            if (!ex.full) continue;
            const verdict = classifyStatusPayload({ retained: cand.retained, identicalToStored: payloadMatchesStored(ex.args, stored) });
            if (verdict === "accept") { accepted = { payload: json, source: cand.retained ? "retained" : "live" }; break; }
          }
          if (accepted) marks.listenOutcome = "payload";
          else if (retry.payloads.length > 0) marks.failErrorClass = "retry_payloads_unaccepted";
          else if (retry.errorClass) marks.failErrorClass = retry.errorClass;
          else marks.failErrorClass = `retry_${retry.outcome}`;
        } catch { /* retry unavailable — the original failure stands, with its stage recorded */ }
      }
    }
    if (!accepted && failureKind) {
      const failure = listenFailureStatus(failureKind);
      return finish({ ok: false, status: failure.status, message: failure.message, verifiedAt: null });
    }
  }
  // Unreachable in practice (a payload-less listen always carries a
  // failureKind and returned above) — but never proceed without one.
  if (!accepted) return finish({ ok: false, status: "unreachable", message: "Couldn't open the grill's cloud link — Traeger's broker didn't answer the connection.", verifiedAt: null });
  marks.payloadSource = accepted.source;
  const extracted = extractGrillStatus(accepted.payload);
  const verifiedAt = new Date().toISOString();
  await applyGrillUpdate(ctx, { ...extracted.args, connected: true, lastVerifiedAt: verifiedAt });
  const result = finish({ ok: true, status: "ok", message: "Fresh grill status loaded.", verifiedAt });
  const tm = result.timing!;
  await addMessage(ctx, null, "system", `Live refresh: fresh grill status pulled directly from Traeger in ${(tm.totalMs / 1000).toFixed(1)}s (sign-in ${tm.tokenMs}ms${tm.tokenRenewed ? ", renewed" : ""} · cloud link ${tm.mqttMs ?? "—"}ms · grill answer ${tm.listenMs ?? "—"}ms · ${tm.payloadSource ?? "live"} payload).`);
  ctx.invalidateQueries();
  return result;
}

export const Actions = {
  getDashboard: defineAction({
    description: "Returns grill state snapshot, meat programs, active cook session, message feed, and verified Traeger status/history.",
    request: z.object({}),
    response: dashboardResponse,
    handler: async (ctx): Promise<Dashboard> => loadDashboard(ctx),
  }),

  getLightDashboard: defineAction({
    description: "Light cook-view payload for refresh results and the periodic poll: grill snapshot, trends, probe estimate, stage view, session, correction, auth state and the last live-refresh timing — no programs, history, message feed, or test results. The client merges it into the dashboard cache so a refresh updates values in place with zero layout shift.",
    request: z.object({}),
    response: lightDashboardResponse,
    handler: async (ctx): Promise<LightDashboard> => {
      const d = await loadDashboard(ctx);
      return {
        grill: d.grill, activeSession: d.activeSession, activeCorrection: d.activeCorrection,
        trends: d.trends, probeEstimate: d.probeEstimate, stageConditionMet: d.stageConditionMet,
        stageView: d.stageView, lastSelectedMeatId: d.lastSelectedMeatId, traegerAuth: d.traegerAuth,
        lastRefreshTiming: lastLiveRefreshTiming,
      };
    },
  }),

  getStatusHistory: defineAction({
    description: "Returns everything Traeger keeps about the owner and grill: account, identity, lifetime usage counters, error history, settings, and dated events from the Nov 7 2026 verified cloud payload.",
    request: z.object({}),
    response: historyShape,
    handler: async (): Promise<z.infer<typeof historyShape>> => TRAEGER_HISTORY,
  }),

  updateGrillState: defineAction({
    description: "Updates the grill state snapshot after Muse runs a real WiFIRE check outside the page, including the grill's own system_status code, derived state label, and whether a cook_id is present.",
    request: z.object({
      connected: z.boolean().optional(), grillTemp: z.number().optional(), ambientTemp: z.number().optional(),
      probeTemp: z.number().optional(), probeConnected: z.boolean().optional(), setpoint: z.number().optional(),
      superSmoke: z.boolean().optional(), keepWarm: z.boolean().optional(),
      lastReportAt: z.string().optional(), lastVerifiedAt: z.string().optional(),
      systemStatus: z.number().optional(), systemStateLabel: z.string().optional(), cookIdPresent: z.boolean().optional(),
    }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => applyGrillUpdate(ctx, args),
  }),

  requestSetpointCorrection: defineAction({
    description: "Records a request for Muse to correct the grill setpoint to the active recipe stage's target temp. The app never talks to Traeger: Muse's live monitor executes the set-temp command and confirms via updateGrillState. Deduped to one outstanding correction per session and stage, and only while the grill is Igniting, Heating, or Cooking.",
    request: z.object({
      sessionId: z.number(), stageIndex: z.number(), fromTemp: z.number(), toTemp: z.number(),
    }),
    response: z.object({ ok: z.literal(true), recorded: z.boolean(), correctionId: z.number().nullable() }),
    handler: async (ctx, args): Promise<{ ok: true; recorded: boolean; correctionId: number | null }> => {
      await ensureSeed(ctx);
      const db = ctx.db<typeof schema>();
      const sRows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, args.sessionId)).limit(1);
      const s = sRows[0];
      if (!s || (s.status !== "active" && s.status !== "shutdown_requested")) return { ok: true, recorded: false, correctionId: null };
      const program = PROGRAMS.find((p) => p.id === s.meatId);
      const stageDef = program?.stages[args.stageIndex];
      if (!stageDef || stageDef.grillTemp == null || stageDef.grillTemp !== args.toTemp) return { ok: true, recorded: false, correctionId: null };
      const gRows = await db.select().from(schema.grillState).limit(1);
      const g = gRows[0];
      if (!g) return { ok: true, recorded: false, correctionId: null };
      const label = deriveSystemStateLabel(g.systemStatus, g.cookIdPresent === 1, g.grillTemp, g.setpoint);
      if (label !== "Igniting" && label !== "Heating" && label !== "Cooking") return { ok: true, recorded: false, correctionId: null };
      if (g.setpoint === args.toTemp) return { ok: true, recorded: false, correctionId: null };
      const dupRows = await db.select().from(schema.setpointCorrections)
        .where(and(
          eq(schema.setpointCorrections.sessionId, args.sessionId),
          eq(schema.setpointCorrections.stageIndex, args.stageIndex),
          eq(schema.setpointCorrections.status, "requested"),
        ))
        .limit(1);
      const dup = dupRows[0];
      if (dup) return { ok: true, recorded: false, correctionId: dup.id };
      const inserted = await db.insert(schema.setpointCorrections).values({
        sessionId: args.sessionId, stageIndex: args.stageIndex,
        fromTemp: args.fromTemp, toTemp: args.toTemp, status: "requested",
      }).returning({ id: schema.setpointCorrections.id });
      const correctionId = inserted[0]!.id;
      await addMessage(ctx, args.sessionId, "system", `Auto-fix requested: grill is set to ${args.fromTemp}°F but Stage ${args.stageIndex + 1} needs ${args.toTemp}°F — Muse will set the grill to ${args.toTemp}°F.`);
      ctx.invalidateQueries();
      return { ok: true, recorded: true, correctionId };
    },
  }),

  setLastSelectedMeat: defineAction({
    description: "Saves the owner's last picked meat from the dropdown so the picker restores it on next open.",
    request: z.object({ meatId: z.string() }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const program = PROGRAMS.find((p) => p.id === args.meatId);
      if (!program) throw new Error("Unknown meat program");
      await ensureSeed(ctx);
      const db = ctx.db<typeof schema>();
      await db.update(schema.grillState).set({ lastSelectedMeatId: args.meatId }).where(eq(schema.grillState.id, 1));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  startCook: defineAction({
    description: "Starts a cook session for the chosen meat program and posts the first stage instructions.",
    request: z.object({ meatId: z.string() }),
    response: z.object({ ok: z.literal(true), sessionId: z.number() }),
    handler: async (ctx, args): Promise<{ ok: true; sessionId: number }> => {
      const program = PROGRAMS.find((p) => p.id === args.meatId);
      if (!program) throw new Error("Unknown meat program");
      const db = ctx.db<typeof schema>();
      await ensureSeed(ctx);
      await db.update(schema.grillState).set({ lastSelectedMeatId: program.id }).where(eq(schema.grillState.id, 1));
      // Cancel any prior active session
      const sessions = await db.select().from(schema.cookSessions).orderBy(desc(schema.cookSessions.id)).limit(5);
      for (const s of sessions) {
        if (s.status === "active" || s.status === "shutdown_requested") {
          await db.update(schema.cookSessions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.cookSessions.id, s.id));
        }
      }
      const now = new Date();
      const gRowsStart = await db.select().from(schema.grillState).limit(1);
      const startProbe = gRowsStart[0]?.probeConnected === 1 ? gRowsStart[0].probeTemp : null;
      const inserted = await db.insert(schema.cookSessions).values({
        meatId: program.id, meatName: program.name, status: "active", currentStageIndex: 0, stageStartedAt: now, createdAt: now, updatedAt: now,
        stageStartProbe: startProbe, alarmAckedKeys: "",
      }).returning({ id: schema.cookSessions.id });
      const sessionId = inserted[0]!.id;
      const first = program.stages[0]!;
      await addMessage(ctx, sessionId, "Muse", `Taking over your ${program.name} cook — ${program.totalLabel} total, probe target ${program.probeTarget}°F. I'll set temps, watch the probe, run timers, and alarm you when it's your turn. Ignition is yours: there's no remote ignite.`);
      await addMessage(ctx, sessionId, "alarm", `Stage 1 of ${program.stages.length}: ${first.title}. ${first.ownerDoes ?? ""}`);
      ctx.invalidateQueries();
      return { ok: true, sessionId };
    },
  }),

  advanceStage: defineAction({
    description: "Manually advances the active cook to the next stage — ONLY for owner stages, where the owner's physical act (wrap, take off, slice) is the stage. Monitored stages (probe/timer/grilltemp) are rejected: they advance automatically via autoAdvanceStage when their condition is met.",
    request: z.object({ sessionId: z.number() }),
    response: z.object({ ok: z.literal(true), completed: z.boolean() }),
    handler: async (ctx, args): Promise<{ ok: true; completed: boolean }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, args.sessionId)).limit(1);
      const s = rows[0];
      if (!s) throw new Error("Session not found");
      const program = PROGRAMS.find((p) => p.id === s.meatId);
      if (!program) throw new Error("Program not found");
      const stageDef = program.stages[s.currentStageIndex];
      if (!stageDef) throw new Error("Stage not found");
      // Server-side enforcement: a manual tap must never skip a monitored
      // stage — the probe, the timer, or the grill temp decides when it ends.
      if (stageDef.completion !== "owner") {
        throw new Error(`Stage "${stageDef.title}" advances automatically (${stageDef.completion}) — manual advance is only for steps that need the owner's hands.`);
      }
      const { completed } = await performAdvance(ctx, s, { auto: false });
      return { ok: true, completed };
    },
  }),

  autoAdvanceStage: defineAction({
    description: "Advances a monitored stage (probe/timer/grilltemp) when — and only when — the server confirms its condition is met by the latest grill snapshot and stage timing. Called by the client on each dashboard poll when getDashboard reports stageConditionMet; also runs inside updateGrillState. Re-validates server-side, so a stale or forged client call cannot skip a stage.",
    request: z.object({ sessionId: z.number() }),
    response: z.object({ ok: z.literal(true), advanced: z.boolean(), completed: z.boolean() }),
    handler: async (ctx, args): Promise<{ ok: true; advanced: boolean; completed: boolean }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, args.sessionId)).limit(1);
      const s = rows[0];
      if (!s || s.status !== "active") return { ok: true, advanced: false, completed: false };
      const program = PROGRAMS.find((p) => p.id === s.meatId);
      const stageDef = program?.stages[s.currentStageIndex];
      if (!program || !stageDef || stageDef.completion === "owner") return { ok: true, advanced: false, completed: false };
      const gRows = await db.select().from(schema.grillState).limit(1);
      const g = gRows[0];
      if (!g) return { ok: true, advanced: false, completed: false };
      const grillLike = {
        probeConnected: g.probeConnected === 1, probeTemp: g.probeTemp, grillTemp: g.grillTemp,
        setpoint: g.setpoint, systemStatus: (g as { systemStatus?: number }).systemStatus ?? 99,
        cookIdPresent: ((g as { cookIdPresent?: number }).cookIdPresent ?? 0) === 1,
      };
      if (!computeStageConditionMet(stageDef, grillLike, s, Date.now())) return { ok: true, advanced: false, completed: false };
      const { completed } = await performAdvance(ctx, s, { auto: true, reason: autoAdvanceReason(stageDef, grillLike) });
      return { ok: true, advanced: true, completed };
    },
  }),

  reconcileSession4: defineAction({
    description: "One-time correction for production session 4 (Chuck Roast): it sits on the Wrap stage (index 2) because of a premature manual Done tap before the probe reached 165°F. If — and only if — session 4 is a Chuck Roast still at stage index 2, move it back to Smoke (index 1), clear any stage-2 alarm acks from the premature advance, and post the correction note with the live probe temp. No-ops otherwise, so it is safe to run once after this build ships.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), reverted: z.boolean() }),
    handler: async (ctx): Promise<{ ok: true; reverted: boolean }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, 4)).limit(1);
      const s = rows[0];
      if (!s || s.meatId !== "chuckroast" || s.currentStageIndex !== 2 || (s.status !== "active" && s.status !== "shutdown_requested")) {
        return { ok: true, reverted: false };
      }
      const gRows = await db.select().from(schema.grillState).limit(1);
      const g = gRows[0];
      const probeTemp = g?.probeTemp ?? 0;
      const keptAcks = parseAckedKeys((s as { alarmAckedKeys?: string }).alarmAckedKeys).filter((k) => !k.startsWith("2-"));
      const now = new Date();
      await db.update(schema.cookSessions).set({
        currentStageIndex: 1,
        stageStartedAt: now,
        updatedAt: now,
        stageStartProbe: g && g.probeConnected === 1 ? g.probeTemp : null,
        holdStartedAt: null,
        alarmAckedKeys: keptAcks.join(","),
      }).where(eq(schema.cookSessions.id, s.id));
      await addMessage(ctx, s.id, "system", `Moved back to Smoke — probe is ${probeTemp}°F, wrap is due at 165°F.`);
      ctx.invalidateQueries();
      return { ok: true, reverted: true };
    },
  }),

  requestShutdown: defineAction({
    description: "Records an emergency shutdown request for the active cook so Muse executes it on the grill.",
    request: z.object({ sessionId: z.number().nullable() }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      if (args.sessionId != null) {
        await db.update(schema.cookSessions).set({ status: "shutdown_requested", updatedAt: new Date() }).where(eq(schema.cookSessions.id, args.sessionId));
      }
      await addMessage(ctx, args.sessionId, "shutdown", "🚨 SHUTDOWN REQUESTED from the cockpit. Muse: shut the grill down now via WiFIRE (command 17) and confirm here. Owner: if anything looks unsafe, power off at the grill itself — don't wait.");
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  requestStatusCheck: defineAction({
    description: "RETIRED legacy endpoint, kept only so old clients don't error: refresh is direct-to-API (liveRefresh) since v28, so this records NOTHING — no feed message, no request to anyone — and simply acknowledges. Nothing in the current client calls it.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx): Promise<{ ok: true }> => {
      void ctx;
      return { ok: true };
    },
  }),

  feedSnapshotHistory: defineAction({
    description: "Snapshot-history feeder, run on the artifact's 2-minute schedule: during an active cook, appends one carry-forward history row (carriedForward=1) copied from the last known grill state when the newest history row is over ~100 seconds old, so sparkline history stays continuous between real checks. Never touches the live snapshot or its lastVerifiedAt; no-ops when no cook is active or history is already fresh.",
    request: z.object({}),
    response: feedResponse,
    handler: async (ctx): Promise<z.infer<typeof feedResponse>> => {
      await ensureSeed(ctx);
      const db = ctx.db<typeof schema>();
      const sessions = await db.select().from(schema.cookSessions).orderBy(desc(schema.cookSessions.id)).limit(10);
      const active = sessions.find((s) => s.status === "active");
      if (!active) return { ok: true, appended: false, reason: "no active cook" };
      const gRows = await db.select().from(schema.grillState).limit(1);
      const g = gRows[0];
      if (!g) return { ok: true, appended: false, reason: "no grill state" };
      const latestRows = await db.select().from(schema.grillSnapshots).orderBy(desc(schema.grillSnapshots.id)).limit(1);
      const latest = latestRows[0];
      const nowMs = Date.now();
      if (latest && nowMs - latest.capturedAt.getTime() < 100_000) return { ok: true, appended: false, reason: "history is fresh" };
      await db.insert(schema.grillSnapshots).values({
        capturedAt: new Date(nowMs), grillTemp: g.grillTemp, probeTemp: g.probeTemp,
        setpoint: g.setpoint, systemStatus: (g as { systemStatus?: number }).systemStatus ?? 99, carriedForward: 1,
      });
      await db.delete(schema.grillSnapshots).where(lt(schema.grillSnapshots.capturedAt, new Date(nowMs - 2 * 60 * 60_000)));
      return { ok: true, appended: true, reason: "carried forward last known snapshot" };
    },
  }),

  traegerSignIn: defineAction({
    description: "Signs in to Traeger with the owner's email + password: exchanges them server-side over HTTPS with Traeger's auth endpoint, then stores the login (server-side only, for unattended re-authentication) plus the cached 24h token. The password is never returned to the client and never logged; on failure nothing is stored.",
    request: z.object({ email: z.string(), password: z.string() }),
    response: signInResponse,
    handler: async (ctx, args): Promise<z.infer<typeof signInResponse>> => {
      const email = args.email.trim();
      if (!email.includes("@") || args.password.length === 0) {
        return { ok: false, status: "invalid_input", message: "Enter your Traeger account email and password.", expiresAt: null };
      }
      let res: Response;
      try {
        res = await fetchWithTimeout(TRAEGER_AUTH_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: email, password: args.password }) }, 10_000);
      } catch { return { ok: false, status: "unreachable", message: "Couldn't reach Traeger's sign-in — try again in a moment.", expiresAt: null }; }
      if (!res.ok) return { ok: false, status: "auth_failed", message: "Traeger didn't accept that email/password — nothing was stored.", expiresAt: null };
      const data = (await res.json().catch(() => null)) as { idToken?: string; expiresIn?: number } | null;
      if (!data?.idToken) return { ok: false, status: "auth_failed", message: "Traeger sign-in returned no token — nothing was stored.", expiresAt: null };
      const expiresAt = new Date(Date.now() + (typeof data.expiresIn === "number" && data.expiresIn > 0 ? data.expiresIn : 86_400) * 1000);
      const db = ctx.db<typeof schema>();
      await db.delete(schema.traegerAuth);
      await db.insert(schema.traegerAuth).values({ id: 1, email, password: args.password, idToken: data.idToken, expiresAt });
      ctx.invalidateQueries();
      return { ok: true, status: "ok", message: "Signed in to Traeger — live refresh is on.", expiresAt: expiresAt.toISOString() };
    },
  }),

  traegerSignOut: defineAction({
    description: "Removes the stored Traeger login and cached token from the server; live refresh returns to sign-in-needed until the owner signs in again.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      await db.delete(schema.traegerAuth);
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  liveRefresh: defineAction({
    description: "Self-service grill refresh: pulls a FRESH status straight from Traeger with no human in the loop — cached 24h token (auto-renewed from the stored login when expired) → signed MQTT URL → MQTT-over-WSS subscription (opened through the runtime's egress proxy when one is configured) → command 90 → the grill's status payload, applied through the same write path as a manual snapshot push. Concurrent taps join the in-flight call and live calls are at least 15s apart. Returns honest statuses: ok / signin_needed / auth_failed / unreachable / timeout / too_soon — a broker connection that dies before the subscription reports unreachable with its listen outcome AND the exact failing stage (proxy CONNECT / TLS / WS upgrade / the worker's own socket, probed from the privileged executor, sanitized to stage + error class) recorded in the timing record; when the privileged path proves healthy, the listen is retried once inside the privileged executor. Only a subscribed listen that hears nothing for the full 12s window reports timeout.",
    request: z.object({}),
    response: liveRefreshResponse,
    privileged: [Privileged.getEgressProxy, Privileged.probeBrokerPath, Privileged.mqttListen],
    handler: async (ctx): Promise<LiveRefreshResult> => {
      const gate = resolveLiveRefreshGate({ nowMs: Date.now(), lastAttemptMs: lastLiveRefreshAttemptMs, inFlight: liveRefreshInFlight != null });
      if (gate === "join" && liveRefreshInFlight) return liveRefreshInFlight;
      if (gate === "wait") return { ok: false, status: "too_soon", message: "Just refreshed — give it a few seconds.", verifiedAt: null, timing: lastLiveRefreshTiming };
      const p = performLiveRefresh(ctx);
      liveRefreshInFlight = p;
      try { return await p; } finally { if (liveRefreshInFlight === p) liveRefreshInFlight = null; }
    },
  }),

  bankHeldTime: defineAction({
    description: "Banks timer time that was held while the grill was not ignited: shifts the active stage's start forward by the held milliseconds (capped at elapsed time) so cold-grill time never counts against a stage.",
    request: z.object({ sessionId: z.number(), heldMs: z.number() }),
    response: z.object({ ok: z.literal(true), shiftedMs: z.number() }),
    handler: async (ctx, args): Promise<{ ok: true; shiftedMs: number }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, args.sessionId)).limit(1);
      const s = rows[0];
      if (!s || (s.status !== "active" && s.status !== "shutdown_requested")) return { ok: true, shiftedMs: 0 };
      const nowMs = Date.now();
      // Prefer the durable server-side hold start (survives reloads, restarts,
      // and rebuilds); fall back to the client-reported held time.
      const heldMs = s.holdStartedAt ? nowMs - s.holdStartedAt.getTime() : args.heldMs;
      const elapsed = Math.max(0, nowMs - s.stageStartedAt.getTime());
      const shift = Math.max(0, Math.min(Math.floor(heldMs), elapsed));
      if (shift > 0 || s.holdStartedAt) {
        await db.update(schema.cookSessions).set({
          stageStartedAt: new Date(s.stageStartedAt.getTime() + shift),
          holdStartedAt: null,
          updatedAt: new Date(),
        }).where(eq(schema.cookSessions.id, s.id));
        ctx.invalidateQueries();
      }
      return { ok: true, shiftedMs: shift };
    },
  }),

  setTimerHold: defineAction({
    description: "Durably records (server-side) when the active stage's timer hold began because the grill is not ignited, so held time survives reloads, restarts, and rebuilds until it is banked.",
    request: z.object({ sessionId: z.number(), since: z.string() }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, args.sessionId)).limit(1);
      const s = rows[0];
      if (s && (s.status === "active" || s.status === "shutdown_requested") && !s.holdStartedAt) {
        const parsed = new Date(args.since);
        const sinceMs = Number.isNaN(parsed.getTime()) ? Date.now() : parsed.getTime();
        const clamped = Math.min(Math.max(sinceMs, s.stageStartedAt.getTime()), Date.now());
        await db.update(schema.cookSessions).set({ holdStartedAt: new Date(clamped), updatedAt: new Date() }).where(eq(schema.cookSessions.id, s.id));
        ctx.invalidateQueries();
      }
      return { ok: true };
    },
  }),

  recordSessionRecovery: defineAction({
    description: "Posts a one-time 'Session recovered' note to the cook message feed when a fresh app load restores an active cook session, so the owner can see recovery happened.",
    request: z.object({ sessionId: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, args.sessionId)).limit(1);
      const s = rows[0];
      if (s && (s.status === "active" || s.status === "shutdown_requested")) {
        await addMessage(ctx, args.sessionId, "system", "Session recovered — your cook was restored exactly where it left off: stage, timer, and messages intact.");
        ctx.invalidateQueries();
      }
      return { ok: true };
    },
  }),

  ackAlarm: defineAction({
    description: "Durably records that the owner acknowledged ('Got it') a stage alarm, per session + stage + alarm kind, so that alarm never fires again — not on reload, recovery, or rebuild. Also used for reality-based auto-acknowledgement.",
    request: z.object({ sessionId: z.number(), stageIndex: z.number(), kind: z.enum(["owner", "expired"]) }),
    response: z.object({ ok: z.literal(true), ackedKeys: z.array(z.string()) }),
    handler: async (ctx, args): Promise<{ ok: true; ackedKeys: string[] }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, args.sessionId)).limit(1);
      const s = rows[0];
      if (!s) return { ok: true, ackedKeys: [] };
      const keys = parseAckedKeys((s as { alarmAckedKeys?: string }).alarmAckedKeys);
      const key = `${args.stageIndex}-${args.kind}`;
      if (!keys.includes(key)) {
        keys.push(key);
        await db.update(schema.cookSessions).set({ alarmAckedKeys: keys.join(","), updatedAt: new Date() }).where(eq(schema.cookSessions.id, s.id));
        ctx.invalidateQueries();
      }
      return { ok: true, ackedKeys: keys };
    },
  }),

  reconcileSession5: defineAction({
    description: "One-time correction for production session 5 (Chuck Roast): created by an accidental cancel + re-COOK at 22:13 UTC, it sits on Preheat (stage index 0) even though the roast never stopped smoking and the probe is already ~86°F. If — and only if — session 5 is a Chuck Roast still active at stage index 0, move it to Smoke (index 1), restart the stage clock at now, set stageStartProbe from the current snapshot, mark stage 0 complete (durable alarm acks), and post the restoration note. Sessions 1–4 are never touched; no-ops otherwise.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), reverted: z.boolean() }),
    handler: async (ctx): Promise<{ ok: true; reverted: boolean }> => {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.cookSessions).where(eq(schema.cookSessions.id, 5)).limit(1);
      const s = rows[0];
      if (!s || s.meatId !== "chuckroast" || s.currentStageIndex !== 0 || s.status !== "active") {
        return { ok: true, reverted: false };
      }
      const gRows = await db.select().from(schema.grillState).limit(1);
      const g = gRows[0];
      const acked = parseAckedKeys((s as { alarmAckedKeys?: string }).alarmAckedKeys);
      for (const k of ["0-owner", "0-expired"]) if (!acked.includes(k)) acked.push(k);
      const now = new Date();
      await db.update(schema.cookSessions).set({
        currentStageIndex: 1,
        stageStartedAt: now,
        updatedAt: now,
        stageStartProbe: g && g.probeConnected === 1 ? g.probeTemp : null,
        holdStartedAt: null,
        alarmAckedKeys: acked.join(","),
      }).where(eq(schema.cookSessions.id, s.id));
      await addMessage(ctx, s.id, "system", "Restored to Smoke — the cook never stopped; cancel + restart was accidental.");
      ctx.invalidateQueries();
      return { ok: true, reverted: true };
    },
  }),

  cancelCook: defineAction({
    description: "Cancels a cook session ONLY when the grill is verifiably not cooking. Rejected while the grill snapshot shows a cook running (system_status 5 Igniting or 6 Cooking with a cook_id present) — a cook in progress can only end by completing or by Shutdown. The cook view offers no cancel control at all; this stays for cleaning up never-started sessions when no cook is running on the grill.",
    request: z.object({ sessionId: z.number() }),
    response: z.object({ ok: z.literal(true) }),
    handler: async (ctx, args): Promise<{ ok: true }> => {
      const db = ctx.db<typeof schema>();
      const gRows = await db.select().from(schema.grillState).limit(1);
      const g = gRows[0];
      const grillCooking = g != null
        && (((g as { systemStatus?: number }).systemStatus ?? 99) === 5 || ((g as { systemStatus?: number }).systemStatus ?? 99) === 6)
        && ((g as { cookIdPresent?: number }).cookIdPresent ?? 0) === 1;
      if (grillCooking) {
        throw new Error("Can't cancel while the grill is cooking — the only ways out of a live cook are finishing it or Shutdown.");
      }
      await db.update(schema.cookSessions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(schema.cookSessions.id, args.sessionId));
      await addMessage(ctx, args.sessionId, "system", "Cook cancelled from the cockpit. The grill itself was not changed — use Shutdown if you need it off.");
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  runIntegrationTests: defineAction({
    description: "Runs the full R1–R13 end-to-end integration test suite against isolated TEST- sessions and synthetic grill snapshots, stores every result in test_runs, and returns the summary. Production sessions and the live grill snapshot are saved before the run and restored after it.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), passed: z.number(), failed: z.number(), total: z.number(), tests: z.array(testRunTestShape) }),
    handler: async (ctx): Promise<{ ok: true; passed: number; failed: number; total: number; tests: z.infer<typeof testRunTestShape>[] }> => {
      const summary = await runIntegrationTests(ctx, BUILD_ID, { Actions, PROGRAMS, REQUIREMENTS, computeStageConditionMet, deriveSystemStateLabel, loadDashboard, parseAckedKeys, formatSnapshotAge, resolveCheckFeedback, resolveThemePreference, resolveLiveRefreshGate, autoRefreshDecision, AUTO_REFRESH_CADENCE_MS, countHeaderCheckNotes, keepAwakeDirective, keepAwakeIntent, alarmRepeatPlan, speechUnlockDirective, stageDetailSheetBlocks, grillTrendTone, probeTrendTone, countHeaderCheckIndicators, headerAgeLabel, formatProbeEstimateLine, tickDownEstimateSeconds, shouldScrollToCurrentStageKey, assessGrillTrend, classifyStatusPayload, LIVE_LISTEN_CAP_MS, APP_VERSION_LABEL, APP_BUILT_AT_ISO, PREVIOUS_BUILD_AT_ISO, appSectionLines, formatBuiltAtLine, resolveBuildRecovery, shouldReloadForBuild, checkStateOnLoad, fetchStatusViaMqtt, liveRefreshTestSeams, resetLiveRefreshGateForTests, resolveEgressProxy, listenFailureStatus, failStageFromProbe, classifySocketError });
      ctx.invalidateQueries();
      return { ok: true, ...summary };
    },
  }),

  runTests: defineAction({
    description: "Alias for runIntegrationTests — runs the R1–R13 guard suite on demand and returns the summary.",
    request: z.object({}),
    response: z.object({ ok: z.literal(true), passed: z.number(), failed: z.number(), total: z.number(), tests: z.array(testRunTestShape) }),
    handler: async (ctx): Promise<{ ok: true; passed: number; failed: number; total: number; tests: z.infer<typeof testRunTestShape>[] }> => {
      const summary = await runIntegrationTests(ctx, BUILD_ID, { Actions, PROGRAMS, REQUIREMENTS, computeStageConditionMet, deriveSystemStateLabel, loadDashboard, parseAckedKeys, formatSnapshotAge, resolveCheckFeedback, resolveThemePreference, resolveLiveRefreshGate, autoRefreshDecision, AUTO_REFRESH_CADENCE_MS, countHeaderCheckNotes, keepAwakeDirective, keepAwakeIntent, alarmRepeatPlan, speechUnlockDirective, stageDetailSheetBlocks, grillTrendTone, probeTrendTone, countHeaderCheckIndicators, headerAgeLabel, formatProbeEstimateLine, tickDownEstimateSeconds, shouldScrollToCurrentStageKey, assessGrillTrend, classifyStatusPayload, LIVE_LISTEN_CAP_MS, APP_VERSION_LABEL, APP_BUILT_AT_ISO, PREVIOUS_BUILD_AT_ISO, appSectionLines, formatBuiltAtLine, resolveBuildRecovery, shouldReloadForBuild, checkStateOnLoad, fetchStatusViaMqtt, liveRefreshTestSeams, resetLiveRefreshGateForTests, resolveEgressProxy, listenFailureStatus, failStageFromProbe, classifySocketError });
      ctx.invalidateQueries();
      return { ok: true, ...summary };
    },
  }),

  getTestStatus: defineAction({
    description: "Returns the R1–R13 requirements registry with each requirement's scenarios and the latest test-run status (guarded / failing / not covered) from test_runs. Scenarios marked manual carry their manual-verification reason and are excluded from the status roll-up.",
    request: z.object({}),
    response: z.object({
      requirements: z.array(z.object({
        id: z.string(), title: z.string(), description: z.string(),
        status: z.enum(["guarded", "failing", "not_covered"]),
        scenarios: z.array(z.object({ id: z.string(), name: z.string(), passed: z.boolean().nullable(), detail: z.string(), manual: z.string().nullable() })),
      })),
      testRuns: testRunsShape,
      gateLine: z.string(),
    }),
    handler: async (ctx): Promise<{ requirements: { id: string; title: string; description: string; status: "guarded" | "failing" | "not_covered"; scenarios: { id: string; name: string; passed: boolean | null; detail: string; manual: string | null }[] }[]; testRuns: TestRunsSummary; gateLine: string }> => {
      const summary = await loadTestRunsSummary(ctx);
      const byId = new Map(summary.tests.map((t) => [t.id, t]));
      const requirements = REQUIREMENTS.map((r) => {
        const scenarios = r.scenarios.map((s) => {
          const t = byId.get(s.id);
          return { id: s.id, name: s.name, passed: t ? t.passed : null, detail: t?.detail ?? "", manual: s.manual ?? null };
        });
        const automated = scenarios.filter((s) => s.manual == null);
        const status: "guarded" | "failing" | "not_covered" = automated.some((s) => s.passed === false) ? "failing" : automated.length > 0 && automated.every((s) => s.passed === true) ? "guarded" : "not_covered";
        return { id: r.id, title: r.title, description: r.description, status, scenarios };
      });
      return { requirements, testRuns: summary, gateLine: "Every feature, past and future, ships with automated E2E tests. A change without tests, or with a red suite, does not ship." };
    },
  }),
} satisfies ActionsModule;
