import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export interface DimensionPreset {
  id: string;
  name: string;
  width: number;
  height: number;
}

interface PresetsConfig {
  presets: DimensionPreset[];
  save_path: string;
}

interface AppState {
  // UI state
  showPresetPanel: boolean;
  setShowPresetPanel: (show: boolean) => void;
  
  // Presets
  presets: DimensionPreset[];
  setPresets: (presets: DimensionPreset[]) => void;
  activePreset: DimensionPreset | null;
  setActivePreset: (preset: DimensionPreset | null) => void;
  
  // Save path
  savePath: string;
  setSavePath: (path: string) => void;
  
  // Load presets from backend
  loadPresets: () => Promise<void>;
  savePresets: () => Promise<void>;
  addPreset: (preset: Omit<DimensionPreset, "id">) => Promise<void>;
  deletePreset: (id: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  // UI state
  showPresetPanel: false,
  setShowPresetPanel: (show) => set({ showPresetPanel: show }),
  
  // Presets
  presets: [],
  setPresets: (presets) => set({ presets }),
  activePreset: null,
  setActivePreset: (preset) => set({ activePreset: preset }),
  
  // Save path
  savePath: "",
  setSavePath: (path) => set({ savePath: path }),
  
  // Actions
  loadPresets: async () => {
    try {
      const config = await invoke<PresetsConfig>("load_presets");
      set({ 
        presets: config.presets,
        savePath: config.save_path,
      });
    } catch (error) {
      console.error("Failed to load presets:", error);
    }
  },
  
  savePresets: async () => {
    const { presets } = get();
    const { savePath } = get();
    try {
      await invoke("save_presets", {
        config: { presets, save_path: savePath }
      });
    } catch (error) {
      console.error("Failed to save presets:", error);
    }
  },
  
  addPreset: async (preset) => {
    const { presets, savePresets } = get();
    const newPreset: DimensionPreset = {
      ...preset,
      id: `preset_${Date.now()}`,
    };
    set({ presets: [...presets, newPreset] });
    await savePresets();
  },
  
  deletePreset: async (id) => {
    const { presets, savePresets } = get();
    set({ presets: presets.filter((p) => p.id !== id) });
    await savePresets();
  },
}));
