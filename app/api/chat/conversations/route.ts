import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/app/utils/supabase/server'; // Assuming a server client utility
import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';

// Define a type for message structure if not already globally available
// For now, assuming messages from client might look like:
// { role: string, content: string, provider?: string, metadata?: any, message_order: number }

export async function GET(req: NextRequest) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            console.error('GET /conversations: Auth error', userError);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const conversationId = req.nextUrl.searchParams.get('conversationId');

        if (conversationId) {
            // Load specific conversation
            const { data: messages, error: messagesError } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('user_id', user.id)
                .eq('conversation_id', conversationId)
                .order('message_order', { ascending: true });

            if (messagesError) {
                console.error('GET /conversations?conversationId: Supabase error', messagesError);
                throw messagesError;
            }

            if (!messages || messages.length === 0) {
                return NextResponse.json({ error: 'Conversation not found or empty' }, { status: 404 });
            }
            return NextResponse.json(messages);

        } else {
            // List conversations for the user (simplified version)
            const { data: convos, error: listError } = await supabase
                .from('chat_messages')
                .select('conversation_id, created_at, content') // Select content for title preview
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (listError) {
                console.error('GET /conversations (list): Supabase error', listError);
                throw listError;
            }

            const conversationSummaries = (convos || []).reduce((acc, msg) => {
                if (!acc[msg.conversation_id]) {
                    acc[msg.conversation_id] = {
                        conversation_id: msg.conversation_id,
                        // Attempt to get a title from the first user message or first message overall
                        title_preview: msg.content?.substring(0, 50) + (msg.content?.length > 50 ? '...' : ''),
                        updated_at: msg.created_at,
                    };
                } else {
                    // Update updated_at if this message is later (more relevant for title if ordering by message_order for first message)
                    if (new Date(msg.created_at) > new Date(acc[msg.conversation_id].updated_at)) {
                        acc[msg.conversation_id].updated_at = msg.created_at;
                        // Optionally update title_preview if this message is considered more representative (e.g. first user message)
                        // This simple version just takes the latest message's created_at for updated_at,
                        // and the first encountered message (due to initial query order) for title.
                    }
                }
                return acc;
            }, {} as Record<string, { conversation_id: string, title_preview: string, updated_at: string }>);

            const sortedSummaries = Object.values(conversationSummaries).sort(
                (a,b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
            );

            return NextResponse.json(sortedSummaries);
        }

    } catch (error: any) {
        console.error('GET /conversations: Unhandled error', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}


export async function POST(req: NextRequest) {
    const cookieStore = cookies();
    const supabase = createClient(cookieStore);

    try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            console.error('POST /conversations: Auth error', userError);
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        let { conversationId, messages } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: 'Messages array is required and cannot be empty.' }, { status: 400 });
        }

        const newConversationId = conversationId || uuidv4();

        // Validate and prepare messages
        const messagesToInsert = messages.map((msg: any, index: number) => {
            if (!msg.role || !msg.content || msg.message_order === undefined || msg.message_order === null) {
                throw new Error(`Message at index ${index} is missing required fields (role, content, message_order).`);
            }
            return {
                user_id: user.id,
                conversation_id: newConversationId,
                message_order: parseInt(msg.message_order, 10), // Ensure it's an integer
                role: msg.role,
                content: msg.content,
                provider: msg.provider || null,
                tool_calls: msg.toolCalls || msg.tool_calls || null, // Handle variations if any
                thread_id: msg.threadId || msg.thread_id || null, // Handle variations from client
                // metadata: msg.metadata || null, // If you have a metadata jsonb column
            };
        });

        // Upsert messages: insert new ones, update existing ones if their content changed (based on unique constraint)
        // A common unique constraint for chat messages would be (conversation_id, message_order, user_id)
        // If message_order can be non-unique temporarily during a save, then a different strategy is needed.
        // Assuming message_order is unique per conversation for now for simple insert.
        // For robust upsert, specify `onConflict`. Example: .upsert(messagesToInsert, { onConflict: 'conversation_id, message_order' })
        // If just appending, and client ensures message_order is new:
        const { data: insertedData, error: insertError } = await supabase
            .from('chat_messages')
            .insert(messagesToInsert)
            .select();

        if (insertError) {
            console.error('POST /conversations: Supabase insert error', insertError);
            // Check for specific errors, e.g., unique constraint violation if message_order isn't handled correctly
            if (insertError.code === '23505') { // Unique violation
                 return NextResponse.json({ error: 'Failed to save messages. Potential duplicate message order or conflict.', details: insertError.message }, { status: 409 });
            }
            throw insertError;
        }

        return NextResponse.json({
            conversationId: newConversationId,
            messages_saved_count: insertedData?.length || 0,
            status: "success"
        });

    } catch (error: any) {
        console.error('POST /conversations: Unhandled error', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
