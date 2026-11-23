// "Vista previa como": un select con su Server Action; sin JS de cliente.
export function PreviewAs({ types, action }: { types: { id: string; name: string }[]; action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="shell-preview">
      <label>
        <span>Vista previa como</span>
        <select name="permissionTypeId" defaultValue="">
          <option value="">Dueño</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
      <button type="submit" className="panel-btn-ghost">Ver</button>
    </form>
  );
}
