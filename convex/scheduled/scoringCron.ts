import { internalAction } from '../_generated/server'
import { internal } from '../_generated/api'

export const recomputeScores = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    await ctx.runMutation(
      internal.channelScores.recomputeForChannelInternal,
      { channel: 'tumblr' }
    )
    await ctx.runMutation(
      internal.channelScores.recomputeForChannelInternal,
      { channel: 'x' }
    )
  },
})
