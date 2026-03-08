import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App.jsx';

vi.mock('./hooks/useOrgData.js', () => ({
  default: () => ({
    data: [
      {
        id: '1',
        name: 'Ahmad',
        url: 'https://app.silsilahku.com/masakhzab/det/profile/1/2',
        father_url: null,
        mother_url: null,
        spouse_urls: [],
        is_mantu: false,
        img_url: '',
      },
    ],
    loading: false,
    error: '',
  }),
}));

vi.mock('./utils/orgGraph.js', () => ({
  buildOrgGraph: () => ({
    nodes: [
      {
        id: 'a',
        position: { x: 0, y: 0 },
        data: {
          label: 'Ahmad',
        },
      },
    ],
    edges: [],
  }),
}));

vi.mock('@xyflow/react', () => ({
  ReactFlowProvider: ({ children }) => <div>{children}</div>,
  useReactFlow: () => ({ setCenter: vi.fn() }),
  ReactFlow: ({ children }) => <div data-testid="reactflow">{children}</div>,
  Background: () => <div />,
  Controls: () => <div />,
  MiniMap: () => <div />,
  Handle: () => <div />,
  Position: {},
}));

test('menampilkan input pencarian dan hasil pencarian', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
  const input = screen.getByPlaceholderText('Ketik nama...');
  fireEvent.change(input, { target: { value: 'Ahmad' } });
  expect(screen.getByRole('button', { name: 'Ahmad' })).toBeInTheDocument();
});
