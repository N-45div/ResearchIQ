import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2023-10-16',
});

export async function POST(req: Request) {
    try {
        // Check if we have an authenticated session
        const authHeader = req.headers.get('cookie') || '';
        let userEmail = null;
        let userId = null;

        if (authHeader.includes('supabase-auth-token')) {
            try {
                // Create Supabase client
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                    {
                        global: { headers: { cookie: authHeader } },
                        auth: { persistSession: false }
                    }
                );

                // Try to get the session
                const { data } = await supabase.auth.getSession();

                if (!data.session?.user) {
                    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                }

                userEmail = data.session.user.email;
                userId = data.session.user.id;
            } catch (error) {
                console.error('Error getting auth session:', error);
                return NextResponse.json({ error: 'Authentication error' }, { status: 401 });
            }
        } else {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { priceId } = await req.json();
        if (!priceId) {
            return NextResponse.json({ error: 'Price ID is required' }, { status: 400 });
        }

        // Create a checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/chat?success=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
            customer_email: userEmail,
            metadata: {
                userId,
            },
        });

        return NextResponse.json({ sessionId: session.id });
    } catch (error) {
        console.error('Error creating checkout session:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
} 