import { useState, useEffect, useCallback } from 'react';
import db from '../utils/store';
import { useDataVersion } from '../lib/dataEvents';

const useReminders = () => {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Refetch whenever anything (this app, another tab of the shell, or a Clio chat run) changes reminders.
  const version = useDataVersion('reminders');

  const refresh = useCallback(async () => {
    try {
      const reminders = await db.getAllReminders();
      setReminders(reminders);
      setError(null);
    } catch (err) {
      setError('Failed to fetch reminders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  const createReminder = async (reminderData) => {
    try {
      const reminder = await db.createReminder(reminderData);
      setReminders(prev => [...prev, reminder]);
      return reminder;
    } catch (err) {
      throw new Error('Failed to create reminder');
    }
  };

  const updateReminder = async (updatedData) => {
    try {
      const reminder = await db.updateReminder(updatedData);
      setReminders(prev => prev.map(r => r.id === reminder.id ? reminder : r));
      return reminder;
    } catch (err) {
      throw new Error('Failed to update reminder');
    }
  };

  const deleteReminder = async (id) => {
    try {
      await db.deleteReminder(id);
      setReminders(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      throw new Error('Failed to delete reminder');
    }
  };

  const completeReminder = async (id) => {
    try {
      const reminder = await db.toggleComplete(id);
      setReminders(prev => prev.map(r => r.id === reminder.id ? reminder : r));
      return reminder;
    } catch (err) {
      throw new Error('Failed to complete reminder');
    }
  };

  const snoozeReminder = async (id, snoozedUntil) => {
    try {
      const current = reminders.find(r => r.id === id);
      if (!current) throw new Error('Reminder not found');
      const newDueDate = new Date(snoozedUntil).toISOString();
      const updated = { ...current, dueDate: newDueDate, snoozedUntil: null };
      const saved = await db.updateReminder(updated);
      setReminders(prev => prev.map(r => r.id === id ? saved : r));
      return saved;
    } catch (err) {
      throw new Error('Failed to snooze reminder');
    }
  };

  return {
    reminders,
    loading,
    error,
    refresh,
    createReminder,
    updateReminder,
    deleteReminder,
    completeReminder,
    snoozeReminder,
  };
};

export function useFilteredReminders(reminders, filter = 'all') {
  switch (filter) {
    case 'completed':
      return reminders?.filter(r => r.completed);
    case 'upcoming':
      return reminders?.filter(r => !r.completed && new Date(r.dueDate) > new Date());
    case 'overdue':
      return reminders?.filter(r => !r.completed && new Date(r.dueDate) < new Date());
    default:
      return reminders;
  }
}

export function useSortedReminders(reminders, sortBy = 'dueDate') {
  const sorted = [...(reminders || [])];

  switch (sortBy) {
    case 'dueDate':
      sorted.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      break;
    case 'created':
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'completed':
      sorted.sort((a, b) => (a.completed ? 1 : -1));
      break;
    default:
      break;
  }

  return sorted;
}

export { useReminders };
