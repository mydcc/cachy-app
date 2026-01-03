import { get } from 'svelte/store';
import { settingsStore } from '../stores/settingsStore';

export const imgurService = {
    async uploadToImgur(file: File): Promise<string> {
        const settings = get(settingsStore);
        const clientId = settings.imgurClientId;

        if (!clientId) {
            throw new Error('Please configure your Imgur Client ID in Settings > API first.');
        }

        const formData = new FormData();
        formData.append('image', file);

        try {
            const response = await fetch('https://api.imgur.com/3/image', {
                method: 'POST',
                headers: {
                    Authorization: `Client-ID ${clientId}`,
                },
                body: formData,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Imgur API Error:', errorData);
                throw new Error(errorData?.data?.error || `Upload failed with status ${response.status}`);
            }

            const data = await response.json();
            if (data.success && data.data && data.data.link) {
                return data.data.link;
            } else {
                throw new Error('Imgur response did not contain a link.');
            }
        } catch (error) {
            console.error('Imgur Upload Error:', error);
            throw error;
        }
    }
};
