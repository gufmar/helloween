import {
  CHANNEL_NAME,
  type BusMessage,
  type ControlToProjection,
  type ProjectionToControl,
} from '../core/types';

export type MessageHandler = (msg: BusMessage) => void;

export class ShowBus {
  private channel: BroadcastChannel;
  private handler: MessageHandler | null = null;

  constructor() {
    this.channel = new BroadcastChannel(CHANNEL_NAME);
    this.channel.onmessage = (ev: MessageEvent<BusMessage>) => {
      this.handler?.(ev.data);
    };
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler;
  }

  post(msg: ControlToProjection | ProjectionToControl): void {
    this.channel.postMessage(msg);
  }

  close(): void {
    this.channel.close();
  }
}
