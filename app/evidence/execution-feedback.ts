export function executionConflictMessage(tr: boolean) {
  return tr
    ? "Kaynak veya kontrol değişti ya da başka bir çalışma tamamlandı. Eski sonuç kaydedilmedi. Güncel durumu inceleyip gerekirse yeniden çalıştırın."
    : "The source or control changed, or another run completed. The outdated result was not saved. Review the current state before running again.";
}
