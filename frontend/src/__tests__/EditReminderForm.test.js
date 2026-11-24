import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import EditReminderForm from '../components/features/EditReminderForm';

describe('EditReminderForm', () => {
  const mockReminder = {
    id: '123',
    title: 'Initial title',
    description: 'Initial description',
    dueDate: '2026-03-20T10:00',
    priority: 'medium',
    repeat: 'never',
    details: 'Initial details'
  };
  const onDismiss = jest.fn();
  const onSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders form with initial values', () => {
    render(
      <EditReminderForm
        reminder={mockReminder}
        onDismiss={onDismiss}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByLabelText(/Title/i)).toHaveValue('Initial title');
    expect(screen.getByLabelText(/Description/i)).toHaveValue('Initial description');
    expect(screen.getByLabelText(/Due Date/i)).toHaveValue('2026-03-20T10:00');
    expect(screen.getByLabelText(/Priority/i)).toHaveValue('medium');
    expect(screen.getByLabelText(/Repeat/i)).toHaveValue('never');
    expect(screen.getByLabelText(/Additional Details/i)).toHaveValue('Initial details');
  });

  test('shows a stored UTC due time as local wall-clock time (not shifted by the offset)', () => {
    const iso = '2026-03-20T10:00:00.000Z';
    render(<EditReminderForm reminder={{ ...mockReminder, dueDate: iso }} onDismiss={onDismiss} onSubmit={onSubmit} />);
    const value = screen.getByLabelText(/Due Date/i).value;
    expect(new Date(value).getTime()).toBe(new Date(iso).getTime()); // datetime-local parses as local time
  });

  test('submits updated data', async () => {
    render(
      <EditReminderForm
        reminder={mockReminder}
        onDismiss={onDismiss}
        onSubmit={onSubmit}
      />
    );

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: 'Updated title' } });

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().slice(0, 16);
    fireEvent.change(screen.getByLabelText(/Due Date/i), { target: { value: tomorrowString } });

    fireEvent.click(screen.getByRole('button', { name: /Update Reminder/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    const submittedData = onSubmit.mock.calls[0][0];
    expect(submittedData.title).toBe('Updated title');
    expect(submittedData.dueDate).not.toBe(mockReminder.dueDate);
  });

  test('clicking cancel calls onDismiss', () => {
    render(
      <EditReminderForm
        reminder={mockReminder}
        onDismiss={onDismiss}
        onSubmit={onSubmit}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});