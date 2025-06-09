export interface CredentialResponse {
    credential: string;
    select_by: string;
    client_id: string;
}

declare global {
    interface Window {
        google: {
            accounts: {
                id: {
                    initialize: (config: any) => void;
                    prompt: (config?: any) => void;
                    renderButton: (parent: HTMLElement, config: any) => void;
                    disableAutoSelect: () => void;
                    storeCredential: (credential: any, callback: () => void) => void;
                    cancel: () => void;
                    revoke: (hint: string, callback: () => void) => void;
                };
            };
        };
    }
} 