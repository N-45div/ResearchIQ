export interface ChatMessage {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    created_at: string;
    provider?: string;
    chat_session_id: string;
}

export interface ChatSession {
    id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
} 