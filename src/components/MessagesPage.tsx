import React, { useState, useEffect, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Send, Loader2, ArrowLeft, Search } from 'lucide-react';
import toast from 'react-hot-toast';

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
}

interface Message {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  receiver_id: string;
  sender: Profile;
  receiver: Profile;
  is_read: boolean;
}

interface MessagesPageProps {
  currentUser: User;
  selectedUser: Profile | null;
  onProfileClick?: (userId: string) => void;
  onClose: () => void;
}

export function MessagesPage({ currentUser, selectedUser: initialSelectedUser, onProfileClick, onClose }: MessagesPageProps) {
  const [selectedUser, setSelectedUser] = useState(initialSelectedUser);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [conversations, setConversations] = useState<{
    user: Profile;
    lastMessage: Message;
  }[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    setSelectedUser(initialSelectedUser);
    if (initialSelectedUser) {
      markMessagesAsRead(initialSelectedUser.id);
    }
  }, [initialSelectedUser]);

  useEffect(() => {
    fetchConversations();
    
    const conversationsSubscription = supabase
      .channel('conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `OR(sender_id=eq.${currentUser.id},receiver_id=eq.${currentUser.id})`
        },
        () => {
          fetchConversations();
        }
      )
      .subscribe();

    return () => {
      conversationsSubscription.unsubscribe();
    };
  }, [currentUser.id]);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser.id);
      markMessagesAsRead(selectedUser.id);
      
      // Clear existing subscription
      if (messageSubscriptionRef.current) {
        messageSubscriptionRef.current.unsubscribe();
      }

      // Set up real-time subscription
      messageSubscriptionRef.current = supabase
        .channel(`messages:${selectedUser.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `OR(and(sender_id=eq.${currentUser.id},receiver_id=eq.${selectedUser.id}),and(sender_id=eq.${selectedUser.id},receiver_id=eq.${currentUser.id}))`
          },
          () => {
            fetchMessages(selectedUser.id);
            markMessagesAsRead(selectedUser.id);
          }
        )
        .subscribe();
    }

    return () => {
      if (messageSubscriptionRef.current) {
        messageSubscriptionRef.current.unsubscribe();
        messageSubscriptionRef.current = null;
      }
    };
  }, [selectedUser, currentUser.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const markMessagesAsRead = async (userId: string) => {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('receiver_id', currentUser.id)
        .eq('sender_id', userId)
        .eq('is_read', false);

      if (error) throw error;

      // Update local state
      setMessages(prevMessages =>
        prevMessages.map(msg => ({
          ...msg,
          is_read: msg.receiver_id === currentUser.id ? true : msg.is_read
        }))
      );

      // Update conversations state
      setConversations(prevConversations =>
        prevConversations.map(conv => {
          if (conv.user.id === userId) {
            return { ...conv };
          }
          return conv;
        })
      );

      // Trigger a refetch of conversations to ensure counts are accurate
      fetchConversations();
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const fetchConversations = async () => {
    try {
      setLoadingConversations(true);

      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(
            id,
            username,
            avatar_url
          ),
          receiver:profiles!messages_receiver_id_fkey(
            id,
            username,
            avatar_url
          )
        `)
        .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
        .order('created_at', { ascending: false });

      if (messageError) throw messageError;

      const conversationsMap = new Map<string, {
        user: Profile;
        lastMessage: Message;
      }>();

      messageData?.forEach(message => {
        const otherUser = message.sender_id === currentUser.id ? message.receiver : message.sender;
        const otherUserId = otherUser.id;

        if (!conversationsMap.has(otherUserId)) {
          conversationsMap.set(otherUserId, {
            user: otherUser,
            lastMessage: message
          });
        }
      });

      setConversations(Array.from(conversationsMap.values()));
    } catch (error) {
      console.error('Error fetching conversations:', error);
      toast.error('Fehler beim Laden der Konversationen');
    } finally {
      setLoadingConversations(false);
    }
  };

  const fetchMessages = async (userId: string) => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(
            id,
            username,
            avatar_url
          ),
          receiver:profiles!messages_receiver_id_fkey(
            id,
            username,
            avatar_url
          )
        `)
        .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUser.id})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching messages:', error);
      toast.error('Fehler beim Laden der Nachrichten');
    }
  };

  const handleSendMessage = async () => {
    if (!selectedUser || !newMessage.trim()) return;

    try {
      setSending(true);

      const { data: newMessageData, error } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUser.id,
          receiver_id: selectedUser.id,
          content: newMessage.trim(),
          is_read: false
        })
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(
            id,
            username,
            avatar_url
          ),
          receiver:profiles!messages_receiver_id_fkey(
            id,
            username,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      // Immediately update the messages list with the new message
      if (newMessageData) {
        setMessages(prev => [...prev, newMessageData]);
        scrollToBottom();
      }

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error('Fehler beim Senden der Nachricht');
    } finally {
      setSending(false);
    }
  };

  const handleSelectConversation = (user: Profile) => {
    setSelectedUser(user);
    markMessagesAsRead(user.id);
  };

  const filteredConversations = conversations.filter(({ user }) =>
    user.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex bg-white">
      {/* Conversations List */}
      <div className={`w-full md:w-[350px] border-r border-gray-200 flex flex-col ${selectedUser ? 'hidden md:flex' : ''}`}>
        {/* Search Bar */}
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Suche"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Conversations */}
        {loadingConversations ? (
          <div className="flex-1 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Keine Konversationen gefunden
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.map(({ user, lastMessage }) => (
              <button
                key={user.id}
                onClick={() => handleSelectConversation(user)}
                className={`w-full p-4 flex items-center space-x-3 hover:bg-gray-50 transition-colors ${
                  selectedUser?.id === user.id ? 'bg-gray-100' : ''
                }`}
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.username}`}
                    alt={user.username}
                    className="w-14 h-14 rounded-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="font-semibold text-sm">{user.username}</div>
                  <div className="text-sm text-gray-500 truncate flex items-center space-x-1">
                    <span className="truncate">
                      {lastMessage.sender_id === currentUser.id && 'Du: '}
                      {lastMessage.content}
                    </span>
                    <span className="flex-shrink-0">
                      • {formatDistanceToNow(new Date(lastMessage.created_at), { addSuffix: true, locale: de })}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedUser ? (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center">
              <button
                onClick={() => {
                  setSelectedUser(null);
                  onClose();
                }}
                className="md:hidden mr-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <button
                onClick={() => onProfileClick?.(selectedUser.id)}
                className="flex items-center space-x-3 hover:opacity-75"
              >
                <img
                  src={selectedUser.avatar_url || `https://ui-avatars.com/api/?name=${selectedUser.username}`}
                  alt={selectedUser.username}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span className="font-semibold">{selectedUser.username}</span>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {loading ? (
                <div className="flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 space-y-4">
                  <img
                    src={selectedUser.avatar_url || `https://ui-avatars.com/api/?name=${selectedUser.username}`}
                    alt={selectedUser.username}
                    className="w-20 h-20 rounded-full object-cover"
                  />
                  <div className="text-center">
                    <p className="font-semibold">{selectedUser.username}</p>
                    <p className="text-sm">Sende eine Nachricht, um eine Konversation zu starten</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map(message => (
                    <div
                      key={message.id}
                      className={`flex ${message.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                          message.sender_id === currentUser.id
                            ? 'bg-blue-500 text-white'
                            : 'bg-white border border-gray-200'
                        }`}
                      >
                        <p className="break-words">{message.content}</p>
                        <p className={`text-[11px] mt-1 ${
                          message.sender_id === currentUser.id
                            ? 'text-blue-100'
                            : 'text-gray-500'
                        }`}>
                          {formatDistanceToNow(new Date(message.created_at), {
                            addSuffix: true,
                            locale: de,
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="p-4 bg-white border-t border-gray-200">
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Nachricht schreiben..."
                  className="flex-1 bg-gray-100 border-none rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !sending) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sending}
                  className="text-blue-500 hover:text-blue-600 disabled:opacity-50 disabled:cursor-not-allowed p-2"
                >
                  {sending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Wähle eine Konversation aus
          </div>
        )}
      </div>
    </div>
  );
}