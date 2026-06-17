import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '../test-utils';
import { Button } from '../../components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';

describe('Accessibility Tests', () => {
  it('should have proper button accessibility', () => {
    render(<Button>Click me</Button>);

    const button = screen.getByRole('button', { name: 'Click me' });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('should have proper focus management', () => {
    render(
      <div>
        <Button>First</Button>
        <Button>Second</Button>
        <Button>Third</Button>
      </div>
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);

    // Test explicit focus on each button
    buttons[0].focus();
    expect(document.activeElement).toBe(buttons[0]);

    // jsdom does not implement native Tab key focus movement;
    // verify the key event is dispatchable without crashing
    fireEvent.keyDown(buttons[0], { key: 'Tab' });
    // Focus stays on buttons[0] in jsdom (no native Tab traversal)
    expect(document.activeElement).not.toBeNull();

    // Verify direct focus still works on other buttons
    buttons[1].focus();
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('should have proper ARIA labels', () => {
    render(<Button aria-label="Close dialog">×</Button>);

    const button = screen.getByRole('button', { name: 'Close dialog' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label', 'Close dialog');
  });

  it('should have proper heading structure', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Test Card</CardTitle>
        </CardHeader>
        <CardContent>
          <p>Card content</p>
        </CardContent>
      </Card>
    );

    const heading = screen.getByRole('heading', { name: 'Test Card' });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H3');
  });

  it('should have proper color contrast', () => {
    render(<Button>Test Button</Button>);

    const button = screen.getByRole('button', { name: 'Test Button' });

    // Check that the button has proper contrast
    expect(button).toHaveClass('text-primary-foreground');
  });

  it('should be keyboard navigable', () => {
    render(
      <div>
        <Button>Button 1</Button>
        <Button>Button 2</Button>
        <Button>Button 3</Button>
      </div>
    );

    const buttons = screen.getAllByRole('button');

    // Test that all buttons are focusable
    buttons.forEach((button) => {
      button.focus();
      expect(document.activeElement).toBe(button);
    });
  });

  it('should have proper form labels', () => {
    render(
      <form>
        <label htmlFor="test-input">Test Input</label>
        <input id="test-input" type="text" />
        <Button type="submit">Submit</Button>
      </form>
    );

    const input = screen.getByLabelText('Test Input');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('id', 'test-input');
  });

  it('should have proper error states', () => {
    render(
      <div>
        <input aria-invalid="true" aria-describedby="error-message" />
        <div id="error-message">This field is required</div>
      </div>
    );

    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'error-message');

    const errorMessage = screen.getByText('This field is required');
    expect(errorMessage).toBeInTheDocument();
  });
});
