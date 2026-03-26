import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '@/lib/api';

interface SettingsState {
    whatsapp: string;
    phone: string;
    supportEmail: string;
    theme: 'light' | 'dark';
    logoUrl: string | null;
    brandName: string;
    brandSubtitle: string;
    updateSettings: (settings: Partial<Omit<SettingsState, 'updateSettings' | 'fetchSettings'>>) => Promise<void>;
    fetchSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set, get) => ({
            whatsapp: '559999999999',
            phone: '+55 99 9999-9999',
            supportEmail: 'suporte@komtektecnologia.com.br',
            theme: 'light',
            logoUrl: null,
            brandName: 'Gases',
            brandSubtitle: 'Distribuição',
            
            fetchSettings: async () => {
                try {
                    const res = await api.get('/api/v1/settings');
                    set((state) => ({ ...state, ...res.data }));
                } catch (error) {
                    console.error("Failed to fetch settings from API:", error);
                }
            },

            updateSettings: async (newSettings) => {
                // Instantly update local UI state
                set((state) => ({ ...state, ...newSettings }));
                
                // Then try pushing to API
                try {
                    const currentState = get();
                    await api.put('/api/v1/settings', {
                        whatsapp: currentState.whatsapp,
                        phone: currentState.phone,
                        support_email: currentState.supportEmail,
                        theme: currentState.theme,
                        logo_url: currentState.logoUrl,
                        brand_name: currentState.brandName,
                        brand_subtitle: currentState.brandSubtitle
                    });
                } catch (error) {
                    console.error("Failed to push settings to API:", error);
                }
            },
        }),
        {
            name: 'settings-storage',
        }
    )
);
