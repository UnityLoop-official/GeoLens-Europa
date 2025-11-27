'use client';

import React, { useState } from 'react';

export default function ChatPanel({ context }: { context?: any }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([
        { role: 'ai', text: 'Hello! I am GeoLens AI. Ask me about environmental risks in the current view.' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setInput('');
        setLoading(true);

        try {
            const res = await fetch('http://localhost:3001/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    history: messages.map(m => ({ role: m.role === 'ai' ? 'model' : 'user', parts: m.text })),
                    context: context ? JSON.stringify(context) : "No specific cell selected. User is viewing the map of Italy."
                })
            });

            const data = await res.json();
            setMessages(prev => [...prev, { role: 'ai', text: data.response }]);
        } catch (e) {
            console.error(e);
            setMessages(prev => [...prev, { role: 'ai', text: "Sorry, I couldn't connect to the AI server." }]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="absolute bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-xl hover:bg-blue-700 transition-all hover:scale-110 z-20"
            >
                💬
            </button>
        );
    }

    return (
        <div className="absolute bottom-6 right-6 w-80 bg-white shadow-2xl rounded-xl border border-slate-200 z-20 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="bg-blue-600 p-3 flex justify-between items-center text-white">
                <h3 className="font-bold text-sm">GeoLens Assistant</h3>
                <button onClick={() => setIsOpen(false)} className="hover:bg-blue-700 p-1 rounded">✕</button>
            </div>

            <div className="h-64 overflow-y-auto p-4 space-y-3 bg-slate-50">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-2 rounded-lg text-sm ${m.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm'
                            }`}>
                            {m.text}
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
                <input
                    className="flex-1 bg-slate-100 border-0 rounded-full px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800"
                    placeholder="Ask about risks..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button
                    onClick={handleSend}
                    className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition"
                >
                    ➤
                </button>
            </div>
        </div>
    );
}
