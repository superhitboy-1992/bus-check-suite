import { screen } from '@testing-library/react';

/* 表单已取消 placeholder 提示文案，测试不再按 placeholder 找输入框，
   改为按「字段标签」定位：取该 label 所在的 Field 容器，再取第一个 input/textarea。 */
export function fieldInput(labelText) {
  const label = screen.getByText(labelText, { selector: 'label' });
  const input = label.parentElement && label.parentElement.querySelector('input, textarea');
  if (!input) throw new Error(`未找到字段「${labelText}」对应的输入框`);
  return input;
}
