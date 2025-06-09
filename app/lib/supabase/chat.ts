import { supabase } from '../supabase';
import { ChatSession, ChatMessage } from '@/app/types/chat';

export const createChatSession = async (userId: string, title: string): Promise<string> => {
    const { data, error } = await supabase
        .from('chat_sessions')
        .insert([
            {
                user_id: userId,
                title,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }
        ])
        .select()
        .single();

    if (error) throw error;
    return data.id;
};

export const addMessageToSession = async (
    sessionId: string,
    message: Omit<ChatMessage, 'id' | 'created_at' | 'chat_session_id'>
): Promise<void> => {
    const { error } = await supabase
        .from('chat_messages')
        .insert([
            {
                ...message,
                chat_session_id: sessionId,
                created_at: new Date().toISOString(),
            }
        ]);

    if (error) throw error;

    // Update the session's updated_at timestamp
    const { error: updateError } = await supabase
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId);

    if (updateError) throw updateError;
};

export const getUserChatSessions = async (userId: string): Promise<ChatSession[]> => {
    const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return data;
};

export const getChatSession = async (sessionId: string): Promise<ChatSession | null> => {
    const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null; // No rows returned
        throw error;
    }
    return data;
};

export const getChatMessages = async (sessionId: string): Promise<ChatMessage[]> => {
    const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_session_id', sessionId)
        .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
}; 