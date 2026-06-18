/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as actions_ai from "../actions/ai.js";
import type * as actions_importer from "../actions/importer.js";
import type * as actions_publisher from "../actions/publisher.js";
import type * as actions_scoring from "../actions/scoring.js";
import type * as auditEvents from "../auditEvents.js";
import type * as auth from "../auth.js";
import type * as channelScores from "../channelScores.js";
import type * as contentItems from "../contentItems.js";
import type * as contentVariants from "../contentVariants.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as importJobs from "../importJobs.js";
import type * as mediaAssets from "../mediaAssets.js";
import type * as performanceMetrics from "../performanceMetrics.js";
import type * as publicationLog from "../publicationLog.js";
import type * as scheduleSlots from "../scheduleSlots.js";
import type * as scheduled_metricsCron from "../scheduled/metricsCron.js";
import type * as scheduled_publishCron from "../scheduled/publishCron.js";
import type * as scheduled_scoringCron from "../scheduled/scoringCron.js";
import type * as scoringRules from "../scoringRules.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "actions/ai": typeof actions_ai;
  "actions/importer": typeof actions_importer;
  "actions/publisher": typeof actions_publisher;
  "actions/scoring": typeof actions_scoring;
  auditEvents: typeof auditEvents;
  auth: typeof auth;
  channelScores: typeof channelScores;
  contentItems: typeof contentItems;
  contentVariants: typeof contentVariants;
  crons: typeof crons;
  http: typeof http;
  importJobs: typeof importJobs;
  mediaAssets: typeof mediaAssets;
  performanceMetrics: typeof performanceMetrics;
  publicationLog: typeof publicationLog;
  scheduleSlots: typeof scheduleSlots;
  "scheduled/metricsCron": typeof scheduled_metricsCron;
  "scheduled/publishCron": typeof scheduled_publishCron;
  "scheduled/scoringCron": typeof scheduled_scoringCron;
  scoringRules: typeof scoringRules;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
