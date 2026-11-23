rule BlueKit_NoMatch {
  strings:
    $never = "this text is absent"
  condition:
    $never
}
