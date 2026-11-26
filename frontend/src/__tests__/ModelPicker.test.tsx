import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelPicker } from '../components/features/ModelPicker';

const apiFetch = vi.fn();
vi.mock('../lib/api', async (orig) => ({ ...(await orig<object>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }));

const models = [
  { id: 'nvidia/nemotron-3-ultra-550b-a55b:free', name: 'Nemotron 3 Ultra', free: true, context: 1000000 },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', free: false, context: 128000 },
];

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockResolvedValue({ models });
});

describe('ModelPicker', () => {
  it('lists tool-capable models and reports the choice', async () => {
    const onChange = vi.fn();
    render(<ModelPicker value="openai/gpt-4o-mini" onChange={onChange} />);
    const select = await screen.findByRole('combobox');
    await screen.findByRole('option', { name: /Nemotron 3 Ultra \(free\)/ });
    await userEvent.selectOptions(select, 'nvidia/nemotron-3-ultra-550b-a55b:free');
    expect(onChange).toHaveBeenCalledWith('nvidia/nemotron-3-ultra-550b-a55b:free');
  });

  it('filters by search and free-only', async () => {
    render(<ModelPicker value="nvidia/nemotron-3-ultra-550b-a55b:free" onChange={() => {}} />);
    const select = await screen.findByRole('combobox');
    await screen.findByRole('option', { name: /GPT-4o mini/ });
    await userEvent.click(screen.getByLabelText(/free only/i));
    expect(within(select).queryByRole('option', { name: /GPT-4o mini/ })).toBeNull();
    await userEvent.click(screen.getByLabelText(/free only/i));
    await userEvent.type(screen.getByLabelText(/search models/i), 'gpt');
    expect(within(select).getByRole('option', { name: /GPT-4o mini/ })).toBeInTheDocument();
  });

  it('warns when the saved model cannot use tools', async () => {
    render(<ModelPicker value="perplexity/pplx-decider-v1.3:free" onChange={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/can't use tools/);
  });

  it('falls back to a text field when the list cannot load', async () => {
    apiFetch.mockRejectedValue(new Error('down'));
    render(<ModelPicker value="x/y" onChange={() => {}} />);
    expect(await screen.findByText(/couldn't load the model list/i)).toBeInTheDocument();
    expect((screen.getByLabelText(/model/i) as HTMLInputElement).value).toBe('x/y');
  });
});
