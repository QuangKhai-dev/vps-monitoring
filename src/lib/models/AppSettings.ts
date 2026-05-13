import mongoose, { Schema, Model } from 'mongoose';

export interface IAppSettings {
  /** Ensures a single settings row (unique). */
  __singleton: number;
  telegramBotToken: string;
  telegramChatId: string;
  alertCpuPercent: number;
  alertRamPercent: number;
  alertDiskPercent: number;
  telegramCooldownSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

const AppSettingsSchema = new Schema<IAppSettings>(
  {
    __singleton: { type: Number, default: 1, unique: true },
    telegramBotToken: { type: String, default: '' },
    telegramChatId: { type: String, default: '' },
    alertCpuPercent: { type: Number, default: 85, min: 1, max: 100 },
    alertRamPercent: { type: Number, default: 85, min: 1, max: 100 },
    alertDiskPercent: { type: Number, default: 90, min: 1, max: 100 },
    telegramCooldownSeconds: { type: Number, default: 300, min: 60, max: 86_400 },
  },
  { timestamps: true }
);

export const AppSettings: Model<IAppSettings> =
  mongoose.models.AppSettings || mongoose.model<IAppSettings>('AppSettings', AppSettingsSchema);
