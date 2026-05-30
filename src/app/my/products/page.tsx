// src/app/my/products/page.tsx
// Redirect to unified ingredients management page
import { redirect } from 'next/navigation';
export default function MyProductsRedirect() {
  redirect('/my/ingredients');
}
