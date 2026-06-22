import { cronJobs } from 'convex/server'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { internal } from './_generated/api'

const crons = cronJobs()

// Every 10 min: publish planned slots at their scheduled time
crons.interval(
  'publish pending slots',
  { minutes: 10 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (internal as any).scheduled.publishCron.publishPendingSlots,
  {}
)

// Daily at 02:00 UTC: collect X/Tumblr performance metrics
crons.cron(
  'collect metrics',
  '0 2 * * *',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (internal as any).scheduled.metricsCron.collectMetrics,
  {}
)

// Weekly Sunday at 03:00 UTC: recompute channel scores
crons.cron(
  'recompute scores',
  '0 3 * * 0',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (internal as any).scheduled.scoringCron.recomputeScores,
  {}
)

export default crons
