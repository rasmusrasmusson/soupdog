// src/app/my/products/new/page.tsx
// Redirect to unified ingredient creation page
import { redirect } from 'next/navigation';
export default function NewProductRedirect() {
  redirect('/my/ingredients/new');
}
