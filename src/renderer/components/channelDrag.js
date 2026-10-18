import { CHANNEL_DRAG_MIME } from "../constants.js";

export const startChannelDrag = (event, channelId) => {
  event.dataTransfer.effectAllowed = "copyMove";
  event.dataTransfer.setData("text/plain", channelId);
  event.dataTransfer.setData(CHANNEL_DRAG_MIME, channelId);
};

/** Latest value of a physical or virtual channel from an engine snapshot. */
export const liveChannelValue = (snapshot, channel) => {
  const index = /^val(\d+)$/.exec(channel.id)?.[1];
  const value = index !== undefined
    ? snapshot.channelValues[Number(index)]
    : snapshot.virtualValues[channel.id];
  return Number.isFinite(value) ? value : 0;
};
