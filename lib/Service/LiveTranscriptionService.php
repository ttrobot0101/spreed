<?php

declare(strict_types=1);
/**
 * SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

namespace OCA\Talk\Service;

use \RuntimeException;
use OCP\App\IAppManager;

class LiveTranscriptionService {

	public function __construct(
		private IAppManager $appManager,
	) {
	}

	public function isLiveTranscriptionAppEnabled(): bool {
		try {
			$appApiPublicFunctions = $this->getAppApiPublicFunctions();
		} catch (\RuntimeException $e) {
			return false;
		}

		$exApp = $appApiPublicFunctions->getExApp('live_transcription');
		if ($exApp === null || !$exApp['enabled']) {
			return false;
		}

		return true;
	}

	private function getAppApiPublicFunctions(): object {
		if (!$this->appManager->isEnabledForUser('app_api')) {
			throw new RuntimeException('app-api');
		}

		try {
			$appApiPublicFunctions = \OCP\Server::get(\OCA\AppAPI\PublicFunctions::class);
		} catch (ContainerExceptionInterface|NotFoundExceptionInterface $e) {
			throw new RuntimeException('app-api-functions');
		}

		return $appApiPublicFunctions;
	}
}
