import React, { useState } from 'react';
import { Portal } from '../ui/Portal';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { PhotoPicker } from '../media/PhotoPicker';
import { PeoplePicker } from '../media/PeoplePicker';
import { PlacePicker } from '../media/PlacePicker';
import { savePhotoItems } from '../../lib/media';

const reminderSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  dueDate: z.coerce.date().min(new Date(), 'Due date must be in the future'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  repeat: z.enum(['never', 'daily', 'weekly', 'monthly', 'yearly']).default('never'),
  details: z.string().optional()
});

const AddReminderForm = ({ onDismiss, onSubmit, asPage = false, embedded = false, onToast }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photos, setPhotos] = useState([]); // PhotoItem[]
  const [places, setPlaces] = useState([]); // at most one
  const [people, setPeople] = useState([]); // at most one
  const [checklist, setChecklist] = useState([{ id: `${Date.now()}-0`, text: '', completed: false }]);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(reminderSchema),
    defaultValues: {
      dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      priority: 'medium',
      repeat: 'never'
    }
  });

  // Checklist handlers
  const addChecklistItem = () => {
    setChecklist(prev => [...prev, { id: `${Date.now()}-${prev.length}`, text: '', completed: false }]);
  };

  const removeChecklistItem = (id) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
  };

  const toggleChecklistItem = (id) => {
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  const updateChecklistItemText = (id, text) => {
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, text } : item
    ));
  };

  const onSubmitForm = async (data) => {
    setIsSubmitting(true);
    try {
      const validChecklist = checklist.filter(item => item.text.trim() !== '');
      const payload = {
        ...data,
        photos: await savePhotoItems(photos), // uploads (or queues) the new ones; stores file names
        location: places[0] ?? null,
        contact: people[0] ?? null,
        checklist: validChecklist
      };
      await onSubmit(payload);
      onDismiss();
      if (onToast) onToast('Reminder created', 'success');
    } catch (error) {
      console.error('Error creating reminder:', error);
      if (onToast) onToast(error.message || 'Failed to create reminder', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <form onSubmit={handleSubmit(onSubmitForm)} className={embedded ? 'space-y-5' : 'p-6 space-y-5'}>
      {/* Title */}
      <div className="mb-5">
        <label htmlFor="title" className="block mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Title *</span>
        </label>
        <input
          {...register('title')}
          id="title"
          type="text"
          className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] 
                   bg-[var(--bg-elevated)] text-[var(--text-primary)] 
                   focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
        />
        {errors.title && <p className="text-sm mt-1.5" style={{ color: 'var(--error)' }}>{errors.title.message}</p>}
      </div>

      {/* Description */}
      <div className="mb-5">
        <label htmlFor="description" className="block mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Description</span>
        </label>
        <textarea
          {...register('description')}
          id="description"
          rows={3}
          className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] 
                   bg-[var(--bg-elevated)] text-[var(--text-primary)] 
                   focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          placeholder="Add details..."
        />
      </div>

      {/* Due Date & Time */}
      <div className="mb-5">
        <label htmlFor="dueDate" className="block mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Due Date & Time *</span>
        </label>
        <input
          {...register('dueDate')}
          id="dueDate"
          type="datetime-local"
          className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] 
                   bg-[var(--bg-elevated)] text-[var(--text-primary)] 
                   focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
        />
        {errors.dueDate && <p className="text-sm mt-1.5" style={{ color: 'var(--error)' }}>{errors.dueDate.message}</p>}
      </div>

      {/* Priority */}
      <div className="mb-5">
        <label htmlFor="priority" className="block mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Priority</span>
        </label>
        <select
          {...register('priority')}
          id="priority"
          className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] 
                   bg-[var(--bg-elevated)] text-[var(--text-primary)] 
                   focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
        >
          <option value="low" style={{ color: 'var(--primary)' }}>Low</option>
          <option value="medium" style={{ color: 'var(--warning)' }}>Medium</option>
          <option value="high" style={{ color: 'var(--error)' }}>High</option>
        </select>
      </div>

      {/* Repeat */}
      <div className="mb-5">
        <label htmlFor="repeat" className="block mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Repeat</span>
        </label>
        <select
          {...register('repeat')}
          id="repeat"
          className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] 
                   bg-[var(--bg-elevated)] text-[var(--text-primary)] 
                   focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
        >
          <option value="never">Never</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>

      {/* Additional Details */}
      <div className="mb-5">
        <label htmlFor="details" className="block mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Additional Details</span>
        </label>
        <textarea
          {...register('details')}
          id="details"
          rows={3}
          className="w-full px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] 
                   bg-[var(--bg-elevated)] text-[var(--text-primary)] 
                   focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
          placeholder="Any extra information..."
        />
      </div>

      {/* Checklist */}
      <div className="mb-5">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Checklist</span>
          <button type="button" onClick={addChecklistItem} className="btn btn-outline btn-sm">
            Add Item
          </button>
        </div>
        <div className="space-y-2">
          {checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2 p-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)]">
              <input
                type="checkbox"
                checked={item.completed}
                onChange={() => toggleChecklistItem(item.id)}
                className="rounded border-gray-300 text-[var(--primary)] focus:ring-[var(--primary)]"
              />
              <input
                type="text"
                value={item.text}
                onChange={(e) => updateChecklistItemText(item.id, e.target.value)}
                placeholder="Checklist item..."
                className="flex-1 px-2 py-1 bg-transparent border-none focus:outline-none text-[var(--text-primary)]"
              />
              <button type="button" onClick={() => removeChecklistItem(item.id)} className="text-[var(--error)] hover:text-[var(--error)] px-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Photos */}
      <div className="mb-5">
        <span className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Photos</span>
        <PhotoPicker value={photos} onChange={setPhotos} />
      </div>

      {/* Contact */}
      <div className="mb-5">
        <span className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Contact</span>
        <PeoplePicker single value={people} onChange={setPeople} />
      </div>

      {/* Location */}
      <div className="mb-5">
        <span className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Location</span>
        <PlacePicker single value={places} onChange={setPlaces} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDismiss} className="btn btn-ghost btn-sm">
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn btn-primary"
        >
          {isSubmitting ? 'Saving...' : 'Create Reminder'}
        </button>
      </div>
    </form>
  );

  // Inside a host Sheet: the Sheet supplies the overlay, title and padding.
  if (embedded) {
    return (
      <>
        {formContent}
      </>
    );
  }

  if (asPage) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-[var(--bg-elevated)] rounded-box overflow-hidden shadow-lg mb-6">
          <div className="p-6 border-b border-[var(--border)]">
            <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Add New Reminder
            </h2>
          </div>
          {formContent}
        </div>
      </div>
    );
  }

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div 
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-[var(--radius-lg)] 
                   border border-[var(--border)] shadow-[var(--shadow-lg)] 
                   bg-[var(--bg-elevated)] animate-scale-in"
      >
        {formContent}
      </div>
    </div>
    </Portal>
  );
};

export default AddReminderForm;
