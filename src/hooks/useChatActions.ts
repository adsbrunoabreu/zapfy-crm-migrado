import type { RefObject } from 'react';
import { useTextSend } from './chat/useTextSend';
import { useFileSend } from './chat/useFileSend';
import { useAudioRecording } from './chat/useAudioRecording';
import { useMessageInteractions } from './chat/useMessageInteractions';
import type { ChatActionsBase } from './chat/types';

export function useChatActions(args: ChatActionsBase & { inputRef?: RefObject<HTMLTextAreaElement> }) {
  const interactions = useMessageInteractions({
    conversation: args.conversation,
    isEvolutionConversation: args.isEvolutionConversation,
    updateCachedMessage: args.updateCachedMessage,
    removeCachedMessage: args.removeCachedMessage,
    inputRef: args.inputRef,
  });

  const text = useTextSend({
    ...args,
    quotedMessage: interactions.quotedMessage,
    setQuotedMessage: interactions.setQuotedMessage,
  });

  const file = useFileSend({ ...args, setSending: text.setSending });
  const audio = useAudioRecording({ ...args, setSending: text.setSending });

  return {
    sending: text.sending,
    sendText: text.sendText,
    pendingFiles: file.pendingFiles,
    setPendingFiles: file.setPendingFiles,
    addPendingFiles: file.addPendingFiles,
    removePendingFile: file.removePendingFile,
    renamePendingFile: file.renamePendingFile,
    clearPendingFiles: file.clearPendingFiles,
    pendingFileSending: file.pendingFileSending,
    uploadAndSendFile: file.uploadAndSendFile,
    uploadAndSendQueue: file.uploadAndSendQueue,
    isRecording: audio.isRecording,
    isPaused: audio.isPaused,
    recordingTime: audio.recordingTime,
    audioLevels: audio.audioLevels,
    toggleRecording: audio.toggleRecording,
    cancelRecording: audio.cancelRecording,
    pauseRecording: audio.pauseRecording,
    resumeRecording: audio.resumeRecording,
    stopAndSendRecording: audio.stopAndSendRecording,
    quotedMessage: interactions.quotedMessage,
    setQuotedMessage: interactions.setQuotedMessage,
    handleReply: interactions.handleReply,
    handleReact: interactions.handleReact,
    handleDeleteMessage: interactions.handleDeleteMessage,
    handleEditMessage: interactions.handleEditMessage,
  };
}
