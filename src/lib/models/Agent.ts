import mongoose, { Schema, Model } from 'mongoose';

export interface IAgent {
  agentId: string;
  token: string;
  hostname: string;
  os: string;
  osVersion: string;
  kernel: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  totalDiskBytes: number;
  publicIp?: string;
  privateIp?: string;
  tags: string[];
  label?: string;
  lastSeenAt?: Date;
  /** Last time a Telegram overload alert was sent (per-server cooldown). */
  lastTelegramAlertAt?: Date;
  registeredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AgentSchema = new Schema<IAgent>(
  {
    agentId: { type: String, required: true, unique: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    hostname: { type: String, default: 'unknown' },
    os: { type: String, default: 'unknown' },
    osVersion: { type: String, default: '' },
    kernel: { type: String, default: '' },
    arch: { type: String, default: '' },
    cpuModel: { type: String, default: '' },
    cpuCores: { type: Number, default: 0 },
    totalMemoryBytes: { type: Number, default: 0 },
    totalDiskBytes: { type: Number, default: 0 },
    publicIp: { type: String },
    privateIp: { type: String },
    tags: { type: [String], default: [] },
    label: { type: String },
    lastSeenAt: { type: Date },
    lastTelegramAlertAt: { type: Date },
    registeredAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export const Agent: Model<IAgent> =
  mongoose.models.Agent || mongoose.model<IAgent>('Agent', AgentSchema);
