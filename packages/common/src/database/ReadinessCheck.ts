export interface ReadinessCheck {
  check(): Promise<boolean>;
}
