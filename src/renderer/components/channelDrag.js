import { CHANNEL_DRAG_MIME } from "../constants.js";

export const startChannelDrag = (event, channelId) => {
  event.dataTransfer.effectAllowed = "copyMove";
  event.dataTransfer.setData("text/plain", channelId);
  event.dataTransfer.setData(CHANNEL_DRAG_MIME, channelId);
};

/** Latest value of a physical or virtual channel (NaN when unknown). */
export const rawChannelValue = (snapshot, channelId) => {
  const index = /^val(\d+)$/.exec(channelId)?.[1];
  const value = index !== undefined ? snapshot.channelValues[Number(index)] : snapshot.virtualValues[channelId];
  return Number.isFinite(value) ? value : Number.NaN;
};

/** Latest value for display lists (0 when unknown). */
export const liveChannelValue = (snapshot, channel) => {
  const value = rawChannelValue(snapshot, channel.id);
  return Number.isFinite(value) ? value : 0;
};
