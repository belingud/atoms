-- Add agent_id column to messages table
ALTER TABLE messages ADD COLUMN agent_id TEXT;

-- Create index for querying messages by agent
CREATE INDEX idx_messages_agent_id ON messages(agent_id);
