# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import os
import torch
import onnx
from stable_baselines3 import PPO
import numpy as np

# --- Configuration ---
TRAINED_MODEL_DIR = "trained_models"
MODEL_NAME = "ppo_cachy_agent"
ONNX_MODEL_NAME = "cachy_brain.onnx"

def main():
    print("🚀 Starting ONNX Export...")

    model_path = os.path.join(TRAINED_MODEL_DIR, MODEL_NAME + ".zip")
    if not os.path.exists(model_path):
        print(f"❌ Model not found at {model_path}. Please run train.py first.")
        return

    # 1. Load PyTorch Model
    print("📥 Loading SB3 Model...")
    model = PPO.load(model_path)

    # Extract the Policy Network (the decision maker)
    # We only need the 'actor' part for inference usually, but SB3 makes it easy to export the whole policy forward pass
    policy = model.policy

    # 2. Define Dummy Input
    # We need to know the observation space shape from training.
    # Based on train.py: 1 + 2*stock_dim + len(INDICATORS)*stock_dim
    # For 1 stock (BTC) and standard indicators (8 usually in FinRL default):
    # 1 (balance) + 2 (prices) + 8 (indicators) = 11 features approx.
    # IMPORTANT: You must match the shape exactly.
    # For now, we assume a shape based on standard FinRL config or we'd load the env to check.
    # Let's try to infer from the policy object if possible, otherwise hardcode for demo.

    try:
        obs_shape = policy.observation_space.shape
        print(f"   Inferred observation shape: {obs_shape}")
    except:
        print("   Could not infer shape, defaulting to (1, 19) (FinRL default for 1 ticker)")
        obs_shape = (19,)

    # Create dummy input tensor
    dummy_input = torch.randn(1, *obs_shape)

    # 3. Export to ONNX
    print("📤 Exporting to ONNX...")
    output_path = os.path.join(TRAINED_MODEL_DIR, ONNX_MODEL_NAME)

    # SB3 policies have a 'predict' method, but for ONNX we often trace the 'forward' or internal net.
    # SB3 provides a helper `predict` which returns (action, state).
    # However, 'forward' returns actions, values, log_probs.
    # For pure inference action, we often just want the deterministic action distribution or mean.

    # Simplified export of the policy network
    class OnnxablePolicy(torch.nn.Module):
        def __init__(self, policy):
            super().__init__()
            self.policy = policy

        def forward(self, observation):
            # Returns the action directly
            # Note: deterministc=True usually means taking the mode of the distribution
            return self.policy.get_distribution(observation).mode()

    onnx_policy = OnnxablePolicy(policy)

    torch.onnx.export(
        onnx_policy,
        dummy_input,
        output_path,
        opset_version=11,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}}
    )

    print(f"✅ Export complete: {output_path}")

    # 4. Verify ONNX Model
    print("🔍 Verifying ONNX Model...")
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print("   Model structure checked.")

    print(f"\n🎉 DONE! You can now move '{output_path}' to your Cachy app's static/models/ folder.")

if __name__ == "__main__":
    main()
